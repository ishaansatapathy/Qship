import { logger } from "@repo/logger";

import { createWorkflowRun, listWorkflowRunsForFeature, updateWorkflowRun } from "../workflow-runs";
import { runPullRequestAiReview } from "./pr-review";

export type WebhookPrReviewDispatchResult = {
  queued: boolean;
  workflowRunId?: string;
  reason?: "already_queued" | "duplicate_head_sha";
};

/** Idempotent async queue — avoids blocking the GitHub webhook HTTP thread. */
export async function dispatchWebhookPullRequestAiReview(input: {
  pullRequestId: string;
  featureId: string;
  headSha: string;
}): Promise<WebhookPrReviewDispatchResult> {
  const headTag = input.headSha.slice(0, 12);
  const runs = await listWorkflowRunsForFeature(input.featureId);
  const duplicate = runs.find(
    (run) =>
      run.type === "ai_review" &&
      (run.status === "pending" || run.status === "running") &&
      (run.message ?? "").includes(headTag),
  );
  if (duplicate) {
    logger.info("webhook.pr_review.deduped", {
      featureId: input.featureId,
      pullRequestId: input.pullRequestId,
      headSha: headTag,
      workflowRunId: duplicate.id,
    });
    return { queued: false, reason: "duplicate_head_sha", workflowRunId: duplicate.id };
  }

  const run = await createWorkflowRun({
    featureRequestId: input.featureId,
    type: "ai_review",
    message: `Webhook PR review queued (${headTag})…`,
  });

  const runner = async () => {
    await updateWorkflowRun(run.id, {
      status: "running",
      progress: 20,
      message: "Running AI review from GitHub webhook…",
    });
    try {
      const result = await runPullRequestAiReview(input.pullRequestId);
      await updateWorkflowRun(run.id, {
        status: result.ok ? "completed" : "failed",
        progress: 100,
        message: result.ok
          ? result.pass
            ? "Webhook AI review passed"
            : "Webhook AI review — fixes needed"
          : `Webhook AI review skipped: ${result.reason}`,
        result: { ...result, headSha: input.headSha, source: "github_webhook" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateWorkflowRun(run.id, {
        status: "failed",
        progress: 100,
        message: `Webhook AI review failed: ${message}`,
        error: message,
      });
      throw error;
    }
  };

  void runner().catch((error) => {
    logger.error("webhook.pr_review.background_failed", {
      featureId: input.featureId,
      pullRequestId: input.pullRequestId,
      workflowRunId: run.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.info("webhook.pr_review.queued", {
    featureId: input.featureId,
    pullRequestId: input.pullRequestId,
    workflowRunId: run.id,
    headSha: headTag,
  });

  return { queued: true, workflowRunId: run.id };
}
