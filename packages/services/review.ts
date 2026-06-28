import { desc, eq } from "@repo/database";
import db from "@repo/database";
import {
  aiReviewIssues,
  aiReviews,
  humanApprovals,
  organizations,
} from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "./errors";
import { appendFeatureActivity, updateFeatureStatus } from "./feature-request";
import type { PrAiReviewResult } from "./feature-ai";

// ── Credit management ─────────────────────────────────────────────────────────

async function getAiReviewCredits(organizationId: string): Promise<number> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { aiReviewCredits: true },
  });
  return org?.aiReviewCredits ?? 0;
}

export async function consumeAiReviewCredit(organizationId: string): Promise<number> {
  const credits = await getAiReviewCredits(organizationId);
  if (credits <= 0) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "No AI review credits remaining. Upgrade your plan in Billing.",
    );
  }
  const remaining = credits - 1;
  await db
    .update(organizations)
    .set({ aiReviewCredits: remaining, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  logger.info("review.credit_consumed", { organizationId, remaining });
  return remaining;
}

// ── AI review persistence ─────────────────────────────────────────────────────

/**
 * Persists an AI review result to the database, increments the iteration counter,
 * transitions the feature status, and appends a timeline activity event.
 */
export async function persistAiReview(input: {
  featureRequestId: string;
  pullRequestId: string;
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

  await db.insert(aiReviews).values({
    id: reviewId,
    featureRequestId: input.featureRequestId,
    pullRequestId: input.pullRequestId,
    iteration,
    summary: input.review.summary,
    readyForHuman: input.review.pass,
    rawAnalysis: input.review as unknown as Record<string, unknown>,
  });

  if (input.review.issues.length > 0) {
    await db.insert(aiReviewIssues).values(
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

  const blockingCount = input.review.issues.filter((i) => i.severity === "blocking").length;
  const nextStatus = input.review.pass ? "human_review" : "fix_needed";
  await updateFeatureStatus(input.featureRequestId, nextStatus);

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
  const latestReview = await getLatestAiReview(featureRequestId);
  if (!latestReview) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Cannot approve: no AI review has been run on this feature yet.",
    );
  }
  if (!latestReview.readyForHuman) {
    const blockingCount = latestReview.issues.filter((i) => i.severity === "blocking").length;
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot approve: AI review has ${blockingCount} unresolved blocking issue(s). Fix them and re-run the AI review first.`,
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
  const id = crypto.randomUUID();
  await db.insert(humanApprovals).values({
    id,
    featureRequestId: input.featureRequestId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    notes: input.notes ?? null,
  });

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
  await updateFeatureStatus(input.featureRequestId, nextStatus);
  await appendFeatureActivity(input.featureRequestId, {
    kind,
    title,
    detail: input.notes,
    actor: "user",
  });

  logger.info("review.human_approval_recorded", {
    featureRequestId: input.featureRequestId,
    decision: input.decision,
    reviewerUserId: input.reviewerUserId,
  });

  return { id, decision: input.decision, nextStatus };
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

/**
 * Marks a feature as shipped. Creates a final human approval record and
 * transitions the feature to the terminal `shipped` status.
 */
export async function markFeatureShipped(featureRequestId: string, userId: string) {
  await updateFeatureStatus(featureRequestId, "shipped");
  await appendFeatureActivity(featureRequestId, {
    kind: "status",
    title: "Feature shipped to production 🚀",
    actor: "user",
  });
  await db.insert(humanApprovals).values({
    id: crypto.randomUUID(),
    featureRequestId,
    reviewerUserId: userId,
    decision: "approved",
    notes: "Shipped to production",
  });

  logger.info("review.feature_shipped", { featureRequestId, userId });
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
) {
  const issue = await db.query.aiReviewIssues.findFirst({
    where: eq(aiReviewIssues.id, issueId),
    with: { aiReview: { columns: { featureRequestId: true, iteration: true } } },
  });
  if (!issue) {
    throw new ServiceError("NOT_FOUND", "AI review issue not found");
  }

  await db
    .update(aiReviewIssues)
    .set({ resolved })
    .where(eq(aiReviewIssues.id, issueId));

  if (issue.aiReview?.featureRequestId) {
    await appendFeatureActivity(issue.aiReview.featureRequestId, {
      kind: "ai_review",
      title: resolved
        ? `Issue resolved: ${issue.title}`
        : `Issue reopened: ${issue.title}`,
      detail: resolutionNotes ?? issue.category,
      actor: "user",
    });
  }

  logger.info("review.issue_resolved", {
    issueId,
    resolved,
    featureRequestId: issue.aiReview?.featureRequestId,
  });

  return { issueId, resolved, title: issue.title };
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

type SlaStatus = "ok" | "at_risk" | "breach";

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

  let slaStatus: SlaStatus = "ok";
  if (waitingInHumanReviewMs !== null) {
    const hours = waitingInHumanReviewMs / (1000 * 60 * 60);
    slaStatus = hours > 48 ? "breach" : hours > 24 ? "at_risk" : "ok";
  }

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

  const healthScore = computeHealthScore({
    passRate: stats.passRate,
    iterationCount: stats.iterationCount,
    slaStatus: cycleTimes.slaStatus,
    allBlockingResolved: resolutionSummary?.allBlockingResolved ?? false,
    latestPass: stats.latestPass,
  });

  return {
    featureRequestId,
    healthScore,
    healthLabel: healthScore >= 80 ? "healthy" : healthScore >= 50 ? "needs_attention" : "critical",
    stats,
    cycleTimes,
    delta,
    latestReviewResolution: resolutionSummary,
    summary: buildHealthSummary(healthScore, stats, cycleTimes),
  };
}

function computeHealthScore(params: {
  passRate: number;
  iterationCount: number;
  slaStatus: SlaStatus;
  allBlockingResolved: boolean;
  latestPass: boolean;
}): number {
  let score = 100;

  // Penalise for low pass rate
  if (params.passRate < 50) score -= 30;
  else if (params.passRate < 75) score -= 15;

  // Penalise for high iteration count (> 3 iterations suggests poor initial quality)
  if (params.iterationCount > 5) score -= 20;
  else if (params.iterationCount > 3) score -= 10;

  // Penalise for SLA breach
  if (params.slaStatus === "breach") score -= 25;
  else if (params.slaStatus === "at_risk") score -= 10;

  // Penalise if latest review failed
  if (!params.latestPass) score -= 15;

  // Penalise if blocking issues unresolved
  if (!params.allBlockingResolved) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function buildHealthSummary(
  score: number,
  stats: Awaited<ReturnType<typeof getReviewStats>>,
  cycleTimes: Awaited<ReturnType<typeof getReviewCycleTimes>>,
): string {
  const parts: string[] = [];

  if (stats.iterationCount === 0) return "No AI review has been run yet.";

  parts.push(`Health score: ${score}/100.`);
  parts.push(`${stats.iterationCount} review iteration${stats.iterationCount === 1 ? "" : "s"}.`);

  if (stats.latestPass) {
    parts.push("Latest review passed.");
  } else {
    parts.push(`Latest review failed — ${stats.averageIssuesPerIteration} avg issues/iteration.`);
  }

  if (cycleTimes.slaStatus === "breach") {
    parts.push(`⚠ SLA breach: waiting ${cycleTimes.waitingInHumanReviewHours}h for human approval.`);
  } else if (cycleTimes.slaStatus === "at_risk") {
    parts.push(`⚠ At risk: ${cycleTimes.waitingInHumanReviewHours}h since AI approved.`);
  }

  return parts.join(" ");
}
