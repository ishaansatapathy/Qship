import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { organizations, pullRequests } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type { PrReviewIssue as PrAiReviewIssue } from "../feature-ai";
import { runFeatureAiReview, runPrAiReview } from "../feature-ai";
import { getFeatureRequest, updateFeatureMetadata, updateFeatureStatus } from "../feature-request";
import { consumeAiReviewCredit, persistAiReview } from "../review";
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
    `## 🤖 ShipFlow AI Review — Iteration ${iteration}`,
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
    `_ShipFlow AI Review · Iteration ${iteration} · ${new Date().toUTCString()}_`,
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

  await updateFeatureStatus(feature.id, "ai_review");

  try {
    await consumeAiReviewCredit(org.id);
  } catch (err) {
    // Credit exhaustion is non-fatal — log and continue so the review still runs.
    logger.warn("pr_review.no_credits_continuing", {
      featureId: feature.id,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

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

  // ── Run AI review ─────────────────────────────────────────────────────────────
  const taskTitles = feature.tasks?.map((t) => t.title) ?? [];
  const review = await runPrAiReview({
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
    prd: feature.prd?.content ?? null,
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

  // ── Post GitHub comment ───────────────────────────────────────────────────────
  try {
    const prdCriteria = feature.prd?.content?.acceptanceCriteria;
    const commentBody = buildReviewComment(review, iteration, prdCriteria);
    await upsertReviewComment(octokit, owner, repo, prRow.githubPrNumber, commentBody);
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

  // Fallback: PRD-only review without code diff.
  logger.info("pr_review.fallback_feature_only", { featureId });

  const review = await runFeatureAiReview({
    title: feature.title,
    rawRequest: feature.rawRequest,
    prd: feature.prd?.content ?? null,
    taskTitles: feature.tasks?.map((t) => t.title) ?? [],
  });

  const nextStatus = review.pass ? "human_review" : "fix_needed";
  await updateFeatureStatus(featureId, nextStatus);
  await updateFeatureMetadata(featureId, {
    lastAiReview: {
      at: new Date().toISOString(),
      pass: review.pass,
      summary: review.summary,
      findings: review.findings,
    },
  });

  return { ok: true as const, pass: review.pass, nextStatus, prLinked: false as const };
}
