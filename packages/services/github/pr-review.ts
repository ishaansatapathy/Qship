import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { organizations, pullRequests } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type { PrReviewIssue as PrAiReviewIssue } from "../feature-ai";
import { runDeltaAiReview, runFeatureAiReview, runPrAiReview } from "../feature-ai";
import { getFeatureRequest, transitionFeatureStatus, updateFeatureMetadata } from "../feature-request";
import { consumeAiReviewCredit, getPreviousBlockingIssues, persistAiReview } from "../review";
import { getInstallationOctokit } from "./client";
import { fetchPullRequestDiff } from "./diff";

// ── GitHub comment builder ────────────────────────────────────────────────────

/**
 * Hidden sentinel that lets us find and *update* an existing ShipFlow review
 * comment on subsequent iterations, rather than leaving a trail of comments.
 */
const COMMENT_SENTINEL = "<!-- shipflow-ai-review -->";

function buildReviewComment(
  review: {
    summary: string;
    pass: boolean;
    issues: PrAiReviewIssue[];
    findings?: string[];
  },
  iteration: number,
  prdCriteria?: string[],
): string {
  const blocking = review.issues.filter((i) => i.severity === "blocking");
  const advisory = review.issues.filter((i) => i.severity !== "blocking");

  const statusBadge = review.pass
    ? "✅ **Ready for human approval**"
    : `⛔ **${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"} — fixes needed**`;

  const lines: string[] = [
    COMMENT_SENTINEL,
    "",
    `## 🤖 Qship AI Review — Iteration ${iteration}`,
    "",
    `> ${statusBadge}`,
    "",
    "---",
    "",
    "### 📝 Summary",
    "",
    review.summary,
    "",
  ];

  // ── Blocking issues ──────────────────────────────────────────────────────────
  if (blocking.length) {
    lines.push(
      `### 🔴 Blocking Issues (${blocking.length})`,
      "",
      "<details open>",
      "<summary>Must be resolved before human review</summary>",
      "",
      "| # | Category | File | Issue |",
      "|---|----------|------|-------|",
      ...blocking.map((issue, i) => {
        const file = issue.filePath
          ? issue.lineNumber
            ? `\`${issue.filePath}:${issue.lineNumber}\``
            : `\`${issue.filePath}\``
          : "—";
        return `| ${i + 1} | ${issue.category} | ${file} | **${issue.title}**: ${issue.description} |`;
      }),
      "",
      "</details>",
      "",
    );
  } else {
    lines.push("### 🟢 No Blocking Issues", "", "");
  }

  // ── Advisory issues ──────────────────────────────────────────────────────────
  if (advisory.length) {
    lines.push(
      `### 🟡 Advisory Issues (${advisory.length})`,
      "",
      "<details>",
      "<summary>Recommended improvements (non-blocking)</summary>",
      "",
      "| # | Category | File | Issue |",
      "|---|----------|------|-------|",
      ...advisory.map((issue, i) => {
        const file = issue.filePath ? `\`${issue.filePath}\`` : "—";
        return `| ${i + 1} | ${issue.category} | ${file} | **${issue.title}**: ${issue.description} |`;
      }),
      "",
      "</details>",
      "",
    );
  }

  // ── Acceptance criteria checklist ────────────────────────────────────────────
  if (prdCriteria?.length) {
    const covered = prdCriteria.filter(
      (c) => review.findings?.some((f) => f.toLowerCase().includes(c.slice(0, 30).toLowerCase())),
    );
    lines.push(
      "### ✅ Acceptance Criteria",
      "",
      ...prdCriteria.map((c) =>
        covered.includes(c) ? `- [x] ${c}` : `- [ ] ${c}`,
      ),
      "",
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  lines.push(
    "---",
    "",
    `_Qship AI Review · Iteration ${iteration} · ${new Date().toUTCString()}_`,
  );

  return lines.join("\n");
}

// ── Comment management (create / update in-place) ────────────────────────────

async function upsertReviewComment(
  octokit: ReturnType<typeof getInstallationOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  // Scan for an existing ShipFlow review comment to update in-place.
  const allComments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = allComments.find((c) => c.body?.includes(COMMENT_SENTINEL));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner, repo, comment_id: existing.id, body,
    });
    logger.info("github.review_comment.updated", { owner, repo, prNumber, commentId: existing.id });
  } else {
    await octokit.rest.issues.createComment({
      owner, repo, issue_number: prNumber, body,
    });
    logger.info("github.review_comment.created", { owner, repo, prNumber });
  }
}

// ── Inline PR review annotations ─────────────────────────────────────────────

/**
 * Posts GitHub pull request review annotations for issues that have a filePath.
 * Uses the pull_request_review API (one review, multiple inline comments) rather
 * than individual issue comments, so they appear inline in the diff view.
 *
 * Uses "COMMENT" event type so Qship never blocks/approves — that stays with humans.
 * Best-effort: failures here never block the pipeline.
 */
async function postInlineAnnotations(
  octokit: ReturnType<typeof getInstallationOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  issues: PrAiReviewIssue[],
): Promise<void> {
  const annotatable = issues.filter(
    (i) => typeof i.filePath === "string" && i.filePath.length > 0,
  );

  if (annotatable.length === 0) return;

  // Only annotate issues where we have both a file path and a parseable line number
  const lineAnnotatable = annotatable.filter((i) => {
    const n = parseInt(i.lineNumber ?? "", 10);
    return !isNaN(n) && n > 0;
  });

  if (lineAnnotatable.length === 0) return;

  const comments = lineAnnotatable.map((issue) => {
    const lineNum = parseInt(issue.lineNumber as string, 10);
    const severity = issue.severity === "blocking" ? "🔴 **Blocking**" : "🟡 Advisory";
    const body = [
      `${severity} · **${issue.category}**: ${issue.title}`,
      "",
      issue.description,
      issue.suggestion ? `\n**Suggested fix:** ${issue.suggestion}` : "",
      issue.requirementRef ? `\n> Requirement: _${issue.requirementRef}_` : "",
      "",
      `_Qship AI Review_`,
    ].join("\n");

    return {
      path: issue.filePath as string,
      line: lineNum,
      side: "RIGHT" as const,
      body,
    };
  });

  // GitHub review API expects all comments in one call
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    event: "COMMENT",
    body: `Qship AI found ${annotatable.length} issue${annotatable.length === 1 ? "" : "s"} with specific file locations. See inline annotations below.`,
    comments,
  });

  logger.info("github.review_annotations.posted", {
    owner,
    repo,
    prNumber,
    count: annotatable.length,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs a full AI code review on an open pull request and posts a structured
 * comment on GitHub. Subsequent iterations update the existing comment in-place
 * rather than creating new ones.
 *
 * Returns `{ ok: false }` if the PR or GitHub connection cannot be found.
 */
export async function runPullRequestAiReview(pullRequestId: string) {
  const prRow = await db.query.pullRequests.findFirst({
    where: eq(pullRequests.id, pullRequestId),
    with: {
      repository: true,
      featureRequest: { with: { prd: true, tasks: true } },
    },
  });

  if (!prRow?.repository) {
    logger.warn("pr_review.pr_not_found", { pullRequestId });
    return { ok: false as const, reason: "pr_not_found" as const };
  }

  const feature = prRow.featureRequest;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, feature.organizationId),
  });

  if (!org?.githubInstallationId) {
    logger.warn("pr_review.github_not_connected", { featureId: feature.id });
    return { ok: false as const, reason: "github_not_connected" as const };
  }

  await consumeAiReviewCredit(org.id);
  await transitionFeatureStatus(feature.id, "ai_review");

  const octokit = getInstallationOctokit(org.githubInstallationId);
  const { owner, name: repo } = prRow.repository;

  // ── Fetch diff ────────────────────────────────────────────────────────────────
  const diff = await fetchPullRequestDiff(octokit, owner, repo, prRow.githubPrNumber);
  if (diff.truncated) {
    logger.info("pr_review.diff_truncated", {
      featureId: feature.id,
      fileCount: diff.files.length,
    });
  }

  // ── Run AI review (full on iteration 1, delta-aware on subsequent) ───────────
  const taskTitles = feature.tasks?.map((t) => t.title) ?? [];
  const previousReview = await getPreviousBlockingIssues(feature.id);

  const review = previousReview && previousReview.blockingIssues.length > 0
    ? await runDeltaAiReview({
        title: feature.title,
        rawRequest: feature.rawRequest,
        prd: feature.prd?.content ?? null,
        taskTitles,
        diffText: diff.diffText,
        prTitle: diff.title,
        changedFiles: diff.files.map((f) => f.filename),
        previousReview,
      })
    : await runPrAiReview({
        title: feature.title,
        rawRequest: feature.rawRequest,
        prd: feature.prd?.content ?? null,
        taskTitles,
        diffText: diff.diffText,
        prTitle: diff.title,
        changedFiles: diff.files.map((f) => f.filename),
      });

  // ── Persist review record ─────────────────────────────────────────────────────
  const { reviewId, iteration, nextStatus } = await persistAiReview({
    featureRequestId: feature.id,
    pullRequestId: prRow.id,
    review,
  });

  await updateFeatureMetadata(feature.id, {
    lastAiReview: {
      at: new Date().toISOString(),
      pass: review.pass,
      summary: review.summary,
      findings: review.findings,
      iteration,
      reviewId,
      pullRequestId: prRow.id,
    },
  });

  // ── Post GitHub comment + inline annotations ─────────────────────────────────
  try {
    const prdCriteria = feature.prd?.content?.acceptanceCriteria;
    const commentBody = buildReviewComment(review, iteration, prdCriteria);
    await upsertReviewComment(octokit, owner, repo, prRow.githubPrNumber, commentBody);

    // Post inline diff annotations for issues with a file location (best-effort)
    if (review.issues.length > 0 && prRow.headSha) {
      await postInlineAnnotations(
        octokit,
        owner,
        repo,
        prRow.githubPrNumber,
        prRow.headSha,
        review.issues,
      ).catch((annotationError) => {
        logger.warn("pr_review.inline_annotations_failed", {
          pullRequestId,
          error: annotationError instanceof Error ? annotationError.message : String(annotationError),
        });
      });
    }
  } catch (error) {
    // Comment failure must not block the review pipeline; it's best-effort.
    logger.warn("pr_review.github_comment_failed", {
      pullRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("pr_review.completed", {
    featureId: feature.id,
    iteration,
    pass: review.pass,
    blockingCount: review.issues.filter((i) => i.severity === "blocking").length,
  });

  return { ok: true as const, reviewId, iteration, nextStatus, pass: review.pass };
}

/**
 * Runs an AI review for a feature request, using its linked pull request diff
 * if available, otherwise falling back to a feature-only review without code.
 */
export async function runFeatureAiReviewWithOptionalPr(
  featureId: string,
  organizationId: string,
) {
  const feature = await getFeatureRequest(featureId);

  const prRow = await db.query.pullRequests.findFirst({
    where: eq(pullRequests.featureRequestId, featureId),
    orderBy: [desc(pullRequests.updatedAt)],
    with: { repository: true },
  });

  // Prefer the full PR-diff review when a linked PR and GitHub connection exist.
  if (prRow?.repository) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (org?.githubInstallationId) {
      return runPullRequestAiReview(prRow.id);
    }
  }

  // Fallback: PRD-only review without code diff — still persisted to DB so
  // the human-approval gate (which checks ai_reviews) works correctly.
  logger.info("pr_review.fallback_feature_only", { featureId });

  await consumeAiReviewCredit(organizationId);
  await transitionFeatureStatus(featureId, "ai_review");

  const review = await runFeatureAiReview({
    title: feature.title,
    rawRequest: feature.rawRequest,
    prd: feature.prd?.content ?? null,
    engineeringTasks: (feature.tasks ?? []).map((t) => ({
      title: t.title,
      taskType: t.taskType,
      acceptanceCriteria: t.acceptanceCriteria,
    })),
  });

  const { persistAiReview } = await import("../review");
  // Convert feature-only review (no diff) to the PrAiReviewResult shape.
  // findings (string[]) are mapped to non-blocking PrReviewIssue entries.
  const prReviewShape = {
    ...review,
    issues: review.pass
      ? []
      : review.findings.map((finding) => ({
          severity: "non_blocking" as const,
          category: "prd_alignment",
          title: finding.length > 80 ? `${finding.slice(0, 77)}…` : finding,
          description: finding,
        })),
  };
  const { reviewId, iteration, nextStatus } = await persistAiReview({
    featureRequestId: featureId,
    pullRequestId: null,
    review: prReviewShape,
  });

  logger.info("pr_review.fallback_persisted", { featureId, reviewId, iteration, nextStatus });
  return { ok: true as const, pass: review.pass, nextStatus, prLinked: false as const };
}
