import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { organizations, pullRequests } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type { PrReviewIssue as PrAiReviewIssue } from "../feature-ai";
import { runDeltaAiReview, runFeatureAiReview, runPrAiReview, generateBlockingIssueFixes } from "../feature-ai";
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

// ── AI auto-fix: GitHub "Commit suggestion" + summary comment ─────────────────

const FIX_SENTINEL = "<!-- shipflow-ai-fixes -->";

/** Extract added lines from a unified diff as suggested replacement code. */
function patchToSuggestedCode(patch: string): string | null {
  const lines = patch.split("\n");
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  if (added.length === 0) {
    // New file or raw code block — use non-header lines as-is
    const body = lines.filter((l) => !l.startsWith("---") && !l.startsWith("+++") && !l.startsWith("@@"));
    return body.length > 0 ? body.join("\n").trim() : null;
  }
  return added.map((l) => l.slice(1)).join("\n").trim();
}

function buildSuggestionCommentBody(fix: {
  issueTitle: string;
  explanation: string;
  suggestedCode: string;
}): string {
  return [
    `🔧 **Qship AI fix** · ${fix.issueTitle}`,
    "",
    fix.explanation,
    "",
    "Click **Commit suggestion** below to apply this fix:",
    "",
    "```suggestion",
    fix.suggestedCode.trim(),
    "```",
    "",
    "_Qship AI · one-click fix_",
  ].join("\n");
}

/**
 * Posts inline GitHub review comments with ```suggestion blocks so developers
 * can apply fixes with one click ("Commit suggestion") on the PR diff.
 */
async function postGithubSuggestedFixes(
  octokit: ReturnType<typeof getInstallationOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  fixes: Array<{
    filePath: string;
    lineNumber?: number;
    issueTitle: string;
    explanation: string;
    suggestedCode: string;
  }>,
): Promise<number> {
  const applicable = fixes.filter(
    (f) =>
      f.filePath.length > 0 &&
      f.suggestedCode.trim().length > 0 &&
      typeof f.lineNumber === "number" &&
      f.lineNumber > 0,
  );

  if (applicable.length === 0) return 0;

  const comments = applicable.slice(0, 10).map((fix) => ({
    path: fix.filePath,
    line: fix.lineNumber!,
    side: "RIGHT" as const,
    body: buildSuggestionCommentBody(fix),
  }));

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    event: "COMMENT",
    body: [
      `## 🔧 Qship AI — One-click fixes`,
      "",
      `${comments.length} inline **Commit suggestion**${comments.length === 1 ? "" : "s"} posted on the diff.`,
      "Open **Files changed** → find Qship comments → click **Commit suggestion** on each fix.",
    ].join("\n"),
    comments,
  });

  logger.info("github.suggested_fixes.posted", {
    owner,
    repo,
    prNumber,
    count: comments.length,
  });

  return comments.length;
}

function enrichFixesForGithub(
  fixes: Array<{
    issueTitle: string;
    filePath: string;
    lineNumber?: number;
    explanation: string;
    patch: string;
    suggestedCode?: string;
    framework?: string;
  }>,
  sourceIssues: Array<{
    title: string;
    filePath?: string;
    lineNumber?: string;
  }>,
) {
  return fixes.map((fix) => {
    const matchedIssue = sourceIssues.find(
      (i) => i.filePath === fix.filePath && (i.title === fix.issueTitle || fix.issueTitle.includes(i.title)),
    );
    const parsedLine = fix.lineNumber ?? parseInt(matchedIssue?.lineNumber ?? "", 10);
    const lineNumber = !isNaN(parsedLine) && parsedLine > 0 ? parsedLine : undefined;
    const suggestedCode =
      fix.suggestedCode?.trim() || patchToSuggestedCode(fix.patch) || "";

    return { ...fix, lineNumber, suggestedCode };
  });
}

function buildFixesComment(
  fixes: Array<{
    issueTitle: string;
    filePath: string;
    lineNumber?: number;
    explanation: string;
    patch: string;
    suggestedCode?: string;
    framework?: string;
  }>,
  detectedFramework: string,
  summary: string,
  inlineCount: number,
): string {
  const lines: string[] = [
    FIX_SENTINEL,
    "",
    "## 🔧 Qship AI — Suggested Code Fixes",
    "",
    `> ${summary}`,
    ...(detectedFramework && detectedFramework !== "unknown"
      ? [`> Detected framework: **${detectedFramework}**`]
      : []),
    "",
  ];

  if (inlineCount > 0) {
    lines.push(
      `✅ **${inlineCount} one-click fix${inlineCount === 1 ? "" : "es"}** posted inline on the diff — use **Commit suggestion** on GitHub.`,
      "",
    );
  } else {
    lines.push(
      "Copy-paste each patch below, or wait for inline suggestions when line numbers are available.",
      "",
    );
  }

  for (const fix of fixes) {
    lines.push(
      `### ${fix.issueTitle}`,
      `**File:** \`${fix.filePath}\`${fix.lineNumber ? ` · line ${fix.lineNumber}` : ""}`,
      "",
      fix.explanation,
      "",
    );
    if (fix.suggestedCode) {
      lines.push("```", fix.suggestedCode, "```", "");
    } else {
      lines.push("```diff", fix.patch, "```", "");
    }
    lines.push("");
  }

  lines.push("---", "", `_Qship AI Auto-Fix · ${new Date().toUTCString()}_`);
  return lines.join("\n");
}

async function upsertFixesComment(
  octokit: ReturnType<typeof getInstallationOctokit>,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const allComments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = allComments.find((c) => c.body?.includes(FIX_SENTINEL));
  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
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

    // Generate one-click GitHub suggestions + summary for blocking issues (best-effort)
    const blockingWithLocation = review.issues.filter(
      (i) => i.severity === "blocking" && i.filePath,
    );
    if (blockingWithLocation.length > 0 && prRow.headSha) {
      generateBlockingIssueFixes({
        featureTitle: feature.title,
        diffText: diff.diffText,
        issues: blockingWithLocation,
        acceptanceCriteria: feature.prd?.content?.acceptanceCriteria,
      })
        .then(async (fixes) => {
          if (fixes.fixes.length === 0) return;

          const enriched = enrichFixesForGithub(fixes.fixes, blockingWithLocation);

          let inlineCount = 0;
          try {
            inlineCount = await postGithubSuggestedFixes(
              octokit,
              owner,
              repo,
              prRow.githubPrNumber,
              prRow.headSha!,
              enriched,
            );
          } catch (suggestionError) {
            logger.warn("pr_review.github_suggestions_failed", {
              pullRequestId,
              error:
                suggestionError instanceof Error
                  ? suggestionError.message
                  : String(suggestionError),
            });
          }

          const commentBody = buildFixesComment(
            enriched,
            fixes.detectedFramework,
            fixes.summary,
            inlineCount,
          );
          await upsertFixesComment(octokit, owner, repo, prRow.githubPrNumber, commentBody);
        })
        .catch((fixError) => {
          logger.warn("pr_review.auto_fix_failed", {
            pullRequestId,
            error: fixError instanceof Error ? fixError.message : String(fixError),
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
