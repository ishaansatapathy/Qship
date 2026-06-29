import { desc, eq, and, sql } from "@repo/database";
import db from "@repo/database";
import {
  aiReviewIssues,
  aiReviews,
  featureRequests,
  humanApprovals,
  organizations,
} from "@repo/database/schema";
import { logger } from "@repo/logger";

import { withTransaction } from "./db/transaction";
import { ServiceError } from "./errors";
import {
  appendFeatureActivity,
  getFeatureRequest,
  guardedUpdateFeatureStatus,
  guardedUpdateFeatureStatusInTx,
} from "./feature-request";
import type { FeatureStatus } from "./workflow";
import { executeFeatureRelease } from "./github/release-ship";
import { getGithubConnectionForUser } from "./github/installation";
import { notifySlackFeatureApproved, notifySlackFeatureShipped } from "./slack";
import type { PrAiReviewResult } from "./feature-ai";
import { assertReleaseReadyForShip } from "./release-validation";
import { isProductionEnv } from "./runtime-env";
import { assertReleaseReviewer, assertReviewIssueInUserWorkspace } from "./workflow-guards";
import {
  buildReviewHealthSummary,
  computeReviewHealthScore,
  computeSlaStatus,
  reviewHealthLabel,
} from "./review-health";

// ── Credit management ─────────────────────────────────────────────────────────

async function getAiReviewCredits(organizationId: string): Promise<number> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { aiReviewCredits: true },
  });
  return org?.aiReviewCredits ?? 0;
}

export async function consumeAiReviewCredit(organizationId: string): Promise<number> {
  return withTransaction(async (tx) => {
    const [row] = await tx
      .update(organizations)
      .set({
        aiReviewCredits: sql`${organizations.aiReviewCredits} - 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(organizations.id, organizationId), sql`${organizations.aiReviewCredits} > 0`))
      .returning({ aiReviewCredits: organizations.aiReviewCredits });

    if (!row) {
      throw new ServiceError(
        "PRECONDITION_FAILED",
        "No AI review credits remaining. Upgrade your plan in Billing.",
      );
    }

    logger.info("review.credit_consumed", { organizationId, remaining: row.aiReviewCredits });
    return row.aiReviewCredits;
  });
}

// ── AI review persistence ─────────────────────────────────────────────────────

/**
 * Persists an AI review result to the database, increments the iteration counter,
 * transitions the feature status, and appends a timeline activity event.
 */
export async function persistAiReview(input: {
  featureRequestId: string;
  pullRequestId?: string | null;
  review: PrAiReviewResult;
}) {
  const prior = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, input.featureRequestId),
    columns: { iteration: true },
    orderBy: [desc(aiReviews.createdAt)],
    limit: 1,
  });
  const iteration = (prior[0]?.iteration ?? 0) + 1;
  const reviewId = crypto.randomUUID();
  const blockingCount = input.review.issues.filter((i) => i.severity === "blocking").length;
  const nextStatus = input.review.pass ? "human_review" : "fix_needed";

  const featureRow = await db.query.featureRequests.findFirst({
    where: eq(featureRequests.id, input.featureRequestId),
    columns: { status: true },
  });
  if (!featureRow) {
    throw new ServiceError("NOT_FOUND", "Feature request not found");
  }
  const fromStatus = featureRow.status as FeatureStatus;

  await withTransaction(async (tx) => {
    await tx.insert(aiReviews).values({
      id: reviewId,
      featureRequestId: input.featureRequestId,
      pullRequestId: input.pullRequestId ?? null,
      iteration,
      summary: input.review.summary,
      readyForHuman: input.review.pass,
      rawAnalysis: input.review as unknown as Record<string, unknown>,
    });

    if (input.review.issues.length > 0) {
      await tx.insert(aiReviewIssues).values(
        input.review.issues.map((issue) => ({
          id: crypto.randomUUID(),
          aiReviewId: reviewId,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
          description: issue.description,
          filePath: issue.filePath ?? null,
          lineNumber: issue.lineNumber ?? null,
          requirementRef: issue.requirementRef ?? null,
          resolved: false,
        })),
      );
    }

    await guardedUpdateFeatureStatusInTx(tx, input.featureRequestId, fromStatus, nextStatus);
  });

  await appendFeatureActivity(input.featureRequestId, {
    kind: "ai_review",
    title: input.review.pass
      ? `AI review passed — iteration ${iteration}`
      : `AI review — ${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"} (iteration ${iteration})`,
    detail: input.review.summary,
    actor: "agent",
  });

  logger.info("review.persisted", {
    featureRequestId: input.featureRequestId,
    reviewId,
    iteration,
    pass: input.review.pass,
    blockingCount,
  });

  return { reviewId, iteration, nextStatus };
}

// ── Review querying ───────────────────────────────────────────────────────────

export async function listAiReviewsForFeature(featureRequestId: string) {
  return db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: true, pullRequest: true },
  });
}

export async function getLatestAiReview(featureRequestId: string) {
  return db.query.aiReviews.findFirst({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: true },
  });
}

/**
 * Returns a human-readable delta summary comparing the latest two review
 * iterations: which issues were resolved, which persisted, and overall progress.
 */
export async function getReviewDelta(featureRequestId: string) {
  const all = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    limit: 2,
    with: { issues: true },
  });

  if (all.length < 2) {
    return null;
  }

  const latest = all[0]!;
  const previous = all[1]!;

  const latestBlockingTitles = new Set(
    latest.issues.filter((i) => i.severity === "blocking").map((i) => i.title),
  );
  const previousBlockingTitles = new Set(
    previous.issues.filter((i) => i.severity === "blocking").map((i) => i.title),
  );

  const resolved = [...previousBlockingTitles].filter((t) => !latestBlockingTitles.has(t));
  const persisting = [...previousBlockingTitles].filter((t) => latestBlockingTitles.has(t));
  const newIssues = [...latestBlockingTitles].filter((t) => !previousBlockingTitles.has(t));

  const overallProgress =
    resolved.length > 0 && persisting.length === 0 && newIssues.length === 0
      ? "improved"
      : newIssues.length > resolved.length
        ? "regressed"
        : "same";

  return {
    fromIteration: previous.iteration,
    toIteration: latest.iteration,
    resolved,
    persisting,
    newIssues,
    overallProgress,
    iterationSummary:
      overallProgress === "improved"
        ? `All ${resolved.length} blocking issue(s) from iteration ${previous.iteration} resolved.`
        : overallProgress === "regressed"
          ? `${newIssues.length} new blocking issue(s) introduced; ${persisting.length} persist from prior review.`
          : `${persisting.length} issue(s) unchanged; ${resolved.length} resolved; ${newIssues.length} new.`,
  };
}

/**
 * Returns complete review health statistics for a feature request:
 * iteration count, total issues found/resolved, time in review, pass rate.
 */
export async function getReviewStats(featureRequestId: string) {
  const reviews = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: { columns: { severity: true, resolved: true } } },
  });

  if (reviews.length === 0) {
    return {
      iterationCount: 0,
      totalIssues: 0,
      resolvedIssues: 0,
      passRate: 0,
      averageIssuesPerIteration: 0,
      latestIteration: 0,
      latestPass: false,
      firstReviewedAt: undefined as Date | undefined,
      latestReviewedAt: undefined as Date | undefined,
    };
  }

  const totalIssues = reviews.reduce((sum, r) => sum + r.issues.length, 0);
  const resolvedIssues = reviews.reduce((sum, r) => sum + r.issues.filter((i) => i.resolved).length, 0);
  const passedCount = reviews.filter((r) => r.readyForHuman).length;

  return {
    iterationCount: reviews.length,
    totalIssues,
    resolvedIssues,
    passRate: Math.round((passedCount / reviews.length) * 100),
    averageIssuesPerIteration: Math.round((totalIssues / reviews.length) * 10) / 10,
    latestIteration: reviews[0]?.iteration ?? 0,
    latestPass: reviews[0]?.readyForHuman ?? false,
    firstReviewedAt: reviews[reviews.length - 1]?.createdAt,
    latestReviewedAt: reviews[0]?.createdAt,
  };
}

/**
 * Returns the previous review's blocking issues for use in delta re-reviews.
 * Returns null if there is no prior review.
 */
export async function getPreviousBlockingIssues(featureRequestId: string) {
  const review = await db.query.aiReviews.findFirst({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: true },
  });

  if (!review) return null;

  return {
    iteration: review.iteration,
    summary: review.summary,
    blockingIssues: review.issues
      .filter((i) => i.severity === "blocking")
      .map((i) => ({
        title: i.title,
        description: i.description,
        filePath: i.filePath,
        category: i.category,
      })),
  };
}

// ── Human approval ─────────────────────────────────────────────────────────────

/**
 * Validates that a feature is in the correct state to receive a human decision.
 * Throws a ServiceError if the feature cannot be approved/rejected right now.
 */
export async function validateHumanApprovalEligibility(featureRequestId: string) {
  const feature = await getFeatureRequest(featureRequestId);
  if (feature.status !== "human_review") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot approve: feature is "${feature.status}", expected "human_review".`,
    );
  }

  const latestReview = await getLatestAiReview(featureRequestId);
  if (!latestReview) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Cannot approve: no AI review has been run on this feature yet.",
    );
  }
  const unresolvedBlocking = latestReview.issues.filter(
    (i) => i.severity === "blocking" && !i.resolved,
  );
  if (!latestReview.readyForHuman || unresolvedBlocking.length > 0) {
    const blockingCount = unresolvedBlocking.length || latestReview.issues.filter((i) => i.severity === "blocking").length;
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot approve: AI review has ${blockingCount} unresolved blocking issue(s). Resolve them and re-run the AI review if needed.`,
    );
  }

  const rawAnalysis = latestReview.rawAnalysis as { demoOnly?: boolean } | null;
  if (isProductionEnv() && rawAnalysis?.demoOnly) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Cannot approve: AI review was seeded for demo only. Run a real AI review before approval.",
    );
  }

  return latestReview;
}

/**
 * Records a human approval decision (approved / rejected / changes_requested)
 * with optional structured notes, transitions feature status, and logs the
 * decision in the activity timeline.
 */
export async function recordHumanApproval(input: {
  featureRequestId: string;
  reviewerUserId: string;
  decision: "approved" | "rejected" | "changes_requested";
  notes?: string;
}) {
  const feature = await getFeatureRequest(input.featureRequestId);
  const fromStatus = feature.status as FeatureStatus;

  if (
    fromStatus === "human_review" &&
    (input.decision === "approved" ||
      input.decision === "rejected" ||
      input.decision === "changes_requested")
  ) {
    await assertReleaseReviewer(input.reviewerUserId, input.featureRequestId);
  }

  if (input.decision === "approved") {
    await validateHumanApprovalEligibility(input.featureRequestId);
  }

  if (input.decision === "approved" && fromStatus !== "human_review") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot approve: feature is "${fromStatus}", expected "human_review".`,
    );
  }
  if (input.decision === "rejected" && fromStatus !== "human_review") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot reject: feature is "${fromStatus}", expected "human_review".`,
    );
  }
  if (input.decision === "changes_requested" && fromStatus !== "human_review") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot request changes: feature is "${fromStatus}", expected "human_review".`,
    );
  }

  const activityMap = {
    approved: {
      nextStatus: "approved" as const,
      title: "Human approval granted ✓",
      kind: "human_review" as const,
    },
    rejected: {
      nextStatus: "rejected" as const,
      title: "Release rejected",
      kind: "human_review" as const,
    },
    changes_requested: {
      nextStatus: "fix_needed" as const,
      title: "Changes requested — back to development",
      kind: "human_review" as const,
    },
  };

  const { nextStatus, title, kind } = activityMap[input.decision];
  const id = crypto.randomUUID();

  await withTransaction(async (tx) => {
    await tx.insert(humanApprovals).values({
      id,
      featureRequestId: input.featureRequestId,
      reviewerUserId: input.reviewerUserId,
      decision: input.decision,
      notes: input.notes ?? null,
    });

    await guardedUpdateFeatureStatusInTx(tx, input.featureRequestId, fromStatus, nextStatus);
  });

  await appendFeatureActivity(input.featureRequestId, {
    kind,
    title,
    detail: input.notes,
    actor: "user",
  });

  let slack;
  if (input.decision === "approved") {
    const pr = feature.pullRequests?.[0];
    const prUrl =
      pr?.url ??
      (pr?.repository?.fullName && pr?.githubPrNumber
        ? `https://github.com/${pr.repository.fullName}/pull/${pr.githubPrNumber}`
        : null);

    slack = await notifySlackFeatureApproved({
      featureId: feature.id,
      featureTitle: feature.title,
      rawRequest: feature.rawRequest,
      approverNotes: input.notes,
      prUrl,
    });
  }

  logger.info("review.human_approval_recorded", {
    featureRequestId: input.featureRequestId,
    decision: input.decision,
    reviewerUserId: input.reviewerUserId,
    slackSent: slack?.sent,
    slackMode: slack?.simulated ? "simulated" : slack?.sent ? "live" : "failed",
  });

  return { id, decision: input.decision, nextStatus, slack };
}

/**
 * Returns the full human approval history for a feature, ordered newest first.
 * Useful for audit trails and re-approval flows.
 */
export async function listHumanApprovals(featureRequestId: string) {
  return db.query.humanApprovals.findMany({
    where: eq(humanApprovals.featureRequestId, featureRequestId),
    orderBy: [desc(humanApprovals.createdAt)],
  });
}

/** Marks a feature shipped: merge linked PR, trigger deploy webhook, then notify Slack. */
export async function markFeatureShipped(featureRequestId: string, userId: string) {
  const { ws, feature } = await assertReleaseReviewer(userId, featureRequestId);

  if (feature.status !== "approved") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot ship: feature is "${feature.status}", expected "approved". Approve the feature first.`,
    );
  }

  const gh = await getGithubConnectionForUser(userId);
  const openPr =
    feature.pullRequests?.find((pr) => pr.state === "open") ?? feature.pullRequests?.[0];

  const release = await executeFeatureRelease({
    featureId: featureRequestId,
    organizationId: ws.organization.id,
    installationId: gh.installationId,
  });

  assertReleaseReadyForShip(release, {
    hadOpenPr: Boolean(openPr),
    hadGithubConnection: Boolean(gh.installationId),
  });

  await withTransaction(async (tx) => {
    await guardedUpdateFeatureStatusInTx(tx, featureRequestId, "approved", "shipped");
  });

  const releaseDetail = release.merge.merged
    ? `PR #${release.merge.prNumber} merged`
    : release.merge.reason === "no_linked_pr"
      ? "No linked PR — status-only ship"
      : `Release: ${release.merge.reason ?? "merge skipped"}`;

  await appendFeatureActivity(featureRequestId, {
    kind: "status",
    title: "Feature shipped to production 🚀",
    detail: [
      releaseDetail,
      release.deploy.triggered
        ? "Deploy webhook triggered"
        : release.deploy.simulated
          ? "Deploy webhook not configured"
          : release.deploy.reason,
    ]
      .filter(Boolean)
      .join(" · "),
    actor: "user",
  });

  const slack = await notifySlackFeatureShipped({
    featureId: feature.id,
    featureTitle: feature.title,
    rawRequest: feature.rawRequest,
  });

  logger.info("review.feature_shipped", {
    featureRequestId,
    userId,
    prMerged: release.merge.merged,
    deployTriggered: release.deploy.triggered,
    slackSent: slack.sent,
    slackMode: slack.simulated ? "simulated" : slack.sent ? "live" : "failed",
  });

  return { status: "shipped" as const, slack, release };
}

// ── Individual issue resolution ────────────────────────────────────────────────

/**
 * Marks a single AI review issue as resolved (or reverts it to unresolved).
 * Used to track which blocking issues have been fixed between review iterations,
 * providing developer-level granularity within a review session.
 */
export async function resolveReviewIssue(
  issueId: string,
  resolved: boolean,
  resolutionNotes?: string,
  userId?: string,
) {
  const issue = userId
    ? await assertReviewIssueInUserWorkspace(userId, issueId)
    : await db.query.aiReviewIssues.findFirst({
        where: eq(aiReviewIssues.id, issueId),
        with: { aiReview: { columns: { featureRequestId: true, id: true, iteration: true } } },
      });

  if (!issue) {
    throw new ServiceError("NOT_FOUND", "AI review issue not found");
  }

  await db
    .update(aiReviewIssues)
    .set({ resolved })
    .where(eq(aiReviewIssues.id, issueId));

  const featureRequestId = issue.aiReview?.featureRequestId;
  let resolutionSummary: Awaited<ReturnType<typeof getIssueResolutionSummary>> | null = null;

  if (featureRequestId) {
    await appendFeatureActivity(featureRequestId, {
      kind: "ai_review",
      title: resolved
        ? `Issue resolved: ${issue.title}`
        : `Issue reopened: ${issue.title}`,
      detail: resolutionNotes ?? issue.category,
      actor: "user",
    });

    if (issue.aiReview?.id) {
      resolutionSummary = await getIssueResolutionSummary(issue.aiReview.id);
      if (resolved && resolutionSummary.allBlockingResolved) {
        await appendFeatureActivity(featureRequestId, {
          kind: "ai_review",
          title: "All blocking issues resolved — ready for re-review or approval",
          actor: "system",
        });
      }
    }
  }

  logger.info("review.issue_resolved", {
    issueId,
    resolved,
    featureRequestId,
    allBlockingResolved: resolutionSummary?.allBlockingResolved,
  });

  return {
    issueId,
    resolved,
    title: issue.title,
    resolutionSummary,
  };
}

/**
 * Returns a resolution summary for all issues in a specific review iteration:
 * how many blocking issues are resolved vs outstanding.
 */
export async function getIssueResolutionSummary(reviewId: string) {
  const issues = await db.query.aiReviewIssues.findMany({
    where: eq(aiReviewIssues.aiReviewId, reviewId),
    columns: { id: true, severity: true, title: true, category: true, resolved: true },
  });

  const blocking = issues.filter((i) => i.severity === "blocking");
  const resolvedBlocking = blocking.filter((i) => i.resolved);
  const advisory = issues.filter((i) => i.severity !== "blocking");
  const resolvedAdvisory = advisory.filter((i) => i.resolved);

  return {
    reviewId,
    total: issues.length,
    blocking: {
      total: blocking.length,
      resolved: resolvedBlocking.length,
      outstanding: blocking.length - resolvedBlocking.length,
      items: blocking.map((i) => ({ id: i.id, title: i.title, category: i.category, resolved: i.resolved })),
    },
    advisory: {
      total: advisory.length,
      resolved: resolvedAdvisory.length,
      outstanding: advisory.length - resolvedAdvisory.length,
    },
    allBlockingResolved: blocking.length === 0 || resolvedBlocking.length === blocking.length,
  };
}

// ── Cycle time tracking ────────────────────────────────────────────────────────

/**
 * Computes SLA and cycle time metrics for a feature's review loop.
 *
 * SLA thresholds for human_review stage:
 * - ok       : < 24 hours
 * - at_risk  : 24–48 hours
 * - breach   : > 48 hours
 */
export async function getReviewCycleTimes(featureRequestId: string) {
  const [reviews, approvals] = await Promise.all([
    db.query.aiReviews.findMany({
      where: eq(aiReviews.featureRequestId, featureRequestId),
      orderBy: [desc(aiReviews.createdAt)],
      columns: { id: true, iteration: true, createdAt: true, readyForHuman: true },
    }),
    db.query.humanApprovals.findMany({
      where: eq(humanApprovals.featureRequestId, featureRequestId),
      orderBy: [desc(humanApprovals.createdAt)],
      columns: { decision: true, createdAt: true },
    }),
  ]);

  const now = Date.now();

  const firstReviewAt = reviews.length ? reviews[reviews.length - 1]!.createdAt.getTime() : null;
  const latestReviewAt = reviews.length ? reviews[0]!.createdAt.getTime() : null;
  const firstApprovalAt = approvals.length ? approvals[approvals.length - 1]!.createdAt.getTime() : null;

  const reviewLoopDurationMs =
    firstReviewAt && latestReviewAt ? latestReviewAt - firstReviewAt : null;

  const timeToFirstApprovalMs =
    firstReviewAt && firstApprovalAt ? firstApprovalAt - firstReviewAt : null;

  // Estimate time currently waiting in human_review by checking last AI review pass
  const lastPassedReview = reviews.find((r) => r.readyForHuman);
  const waitingInHumanReviewMs =
    lastPassedReview && !approvals.length
      ? now - lastPassedReview.createdAt.getTime()
      : null;

  const slaStatus = computeSlaStatus(waitingInHumanReviewMs);

  return {
    featureRequestId,
    reviewIterationCount: reviews.length,
    firstReviewAt: firstReviewAt ? new Date(firstReviewAt) : null,
    latestReviewAt: latestReviewAt ? new Date(latestReviewAt) : null,
    reviewLoopDurationMs,
    reviewLoopDurationHours: reviewLoopDurationMs ? Math.round(reviewLoopDurationMs / 36000) / 100 : null,
    timeToFirstApprovalMs,
    timeToFirstApprovalHours: timeToFirstApprovalMs ? Math.round(timeToFirstApprovalMs / 36000) / 100 : null,
    waitingInHumanReviewMs,
    waitingInHumanReviewHours: waitingInHumanReviewMs ? Math.round(waitingInHumanReviewMs / 36000) / 100 : null,
    slaStatus,
    humanApprovalCount: approvals.length,
  };
}

/**
 * Returns a comprehensive review loop health summary combining:
 * review stats, cycle times, issue resolution, and delta progress.
 */
export async function getReviewLoopHealth(featureRequestId: string) {
  const [stats, cycleTimes, latestReview, delta] = await Promise.all([
    getReviewStats(featureRequestId),
    getReviewCycleTimes(featureRequestId),
    getLatestAiReview(featureRequestId),
    getReviewDelta(featureRequestId),
  ]);

  const resolutionSummary = latestReview
    ? await getIssueResolutionSummary(latestReview.id)
    : null;

  const healthScore = computeReviewHealthScore({
    passRate: stats.passRate,
    iterationCount: stats.iterationCount,
    slaStatus: cycleTimes.slaStatus,
    allBlockingResolved: resolutionSummary?.allBlockingResolved ?? false,
    latestPass: stats.latestPass,
  });

  return {
    featureRequestId,
    healthScore,
    healthLabel: reviewHealthLabel(healthScore),
    stats,
    cycleTimes,
    delta,
    latestReviewResolution: resolutionSummary,
    summary: buildReviewHealthSummary({
      score: healthScore,
      iterationCount: stats.iterationCount,
      latestPass: stats.latestPass,
      averageIssuesPerIteration: stats.averageIssuesPerIteration,
      slaStatus: cycleTimes.slaStatus,
      waitingInHumanReviewHours: cycleTimes.waitingInHumanReviewHours,
    }),
  };
}
