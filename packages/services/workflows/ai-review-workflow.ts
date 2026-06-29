import { logger } from "@repo/logger";

import { runFeatureAiReviewWithOptionalPr } from "../github/pr-review";
import { getMembershipForUser } from "../organization";
import { getReviewDelta, getReviewStats } from "../review";
import { ServiceError } from "../errors";
import { updateWorkflowRun, assertWorkflowRunActive } from "../workflow-runs";

/**
 * Inngest workflow for AI-powered pre-ship review.
 *
 * Progress stages:
 *  10% — validating workspace + feature access
 *  25% — loading PR diff and previous review context
 *  45% — selecting review mode (full vs delta re-review)
 *  65% — running AI analysis
 *  85% — persisting results + posting GitHub comment
 * 100% — complete
 */
export async function runAiReviewWorkflow(input: {
  featureId: string;
  userId: string;
  workflowRunId: string;
}) {
  const { featureId, userId, workflowRunId } = input;

  try {
    await assertWorkflowRunActive(workflowRunId);
    // ── Stage 1: validate workspace ───────────────────────────────────────────
    await updateWorkflowRun(workflowRunId, {
      status: "running",
      progress: 10,
      message: "Validating workspace access…",
    });

    const membership = await getMembershipForUser(userId);
    if (!membership) {
      throw new ServiceError("FORBIDDEN", "Join a workspace before running reviews");
    }

    // ── Stage 2: load PR diff + previous review context ───────────────────────
    await updateWorkflowRun(workflowRunId, {
      progress: 25,
      message: "Loading feature, PR diff, and review history…",
    });

    const stats = await getReviewStats(featureId);

    // ── Stage 3: choose review mode ───────────────────────────────────────────
    await updateWorkflowRun(workflowRunId, {
      progress: 45,
      message:
        stats.iterationCount === 0
          ? "Running full AI review (first iteration)…"
          : `Running delta re-review (iteration ${stats.iterationCount + 1} — checking ${stats.latestIteration === 0 ? 0 : stats.iterationCount} prior issue(s))…`,
    });

    // ── Stage 4: run AI analysis ──────────────────────────────────────────────
    await updateWorkflowRun(workflowRunId, {
      progress: 65,
      message: "Analysing code against PRD acceptance criteria…",
    });

    const result = await runFeatureAiReviewWithOptionalPr(featureId, membership.organizationId);

    // ── Stage 5: persist + post GitHub comment ────────────────────────────────
    await updateWorkflowRun(workflowRunId, {
      progress: 85,
      message: "Persisting review results and posting GitHub comment…",
    });

    // Load delta for enriched completion message
    const delta = await getReviewDelta(featureId).catch(() => null);

    const completionMessage = buildCompletionMessage(result, delta, stats.iterationCount + 1);

    // ── Stage 6: complete ─────────────────────────────────────────────────────
    await updateWorkflowRun(workflowRunId, {
      status: result.ok ? "completed" : "failed",
      progress: 100,
      message: completionMessage,
      result: {
        ok: result.ok,
        pass: "pass" in result ? result.pass : undefined,
        reviewId: "reviewId" in result ? result.reviewId : undefined,
        iteration: "iteration" in result ? result.iteration : undefined,
        delta: delta
          ? {
              resolved: delta.resolved.length,
              persisting: delta.persisting.length,
              new: delta.newIssues.length,
              progress: delta.overallProgress,
            }
          : null,
      },
    });

    logger.info("ai_review_workflow.completed", {
      featureId,
      workflowRunId,
      pass: "pass" in result ? result.pass : false,
      ok: result.ok,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error("ai_review_workflow.failed", {
      featureId,
      workflowRunId,
      error: message,
    });

    await updateWorkflowRun(workflowRunId, {
      status: "failed",
      progress: 100,
      message: `AI review failed: ${message}`,
      error: message,
    });

    throw error;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ReviewResult =
  | { ok: false; reason: string }
  | { ok: true; pass: boolean; iteration?: number; nextStatus?: string; prLinked?: boolean };

type DeltaResult = {
  resolved: string[];
  persisting: string[];
  newIssues: string[];
  overallProgress: string;
  iterationSummary: string;
} | null;

function buildCompletionMessage(
  result: ReviewResult,
  delta: DeltaResult,
  currentIteration: number,
): string {
  if (!result.ok) {
    return `Review skipped — connect GitHub or link a PR to enable code review`;
  }

  const iterTag = currentIteration > 1 ? ` (iteration ${currentIteration})` : "";

  if (!result.pass) {
    if (delta && delta.overallProgress === "improved") {
      return `Progress made${iterTag} — ${delta.resolved.length} issue(s) resolved, ${delta.persisting.length} remaining`;
    }
    if (delta && delta.overallProgress === "regressed") {
      return `⚠ Regression detected${iterTag} — ${delta.newIssues.length} new blocking issue(s) introduced`;
    }
    return `AI review — fixes needed${iterTag}`;
  }

  return delta
    ? `✓ AI review passed${iterTag} — all ${delta.resolved.length + delta.persisting.length === 0 ? "" : delta.resolved.length + " "}issue(s) resolved`
    : `✓ AI review passed${iterTag} — ready for human approval`;
}
