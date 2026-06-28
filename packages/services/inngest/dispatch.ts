import { logger } from "@repo/logger";

import { createWorkflowRun, getActiveWorkflowOfType, listWorkflowRunsForFeature, updateWorkflowRun } from "../workflow-runs";
import { runPrdGenerationWorkflow } from "../workflows/prd-generation";
import { runTaskGenerationWorkflow } from "../workflows/task-generation";
import { runAiReviewWorkflow } from "../workflows/ai-review-workflow";

import { inngest, INNGEST_EVENTS, isInngestCloudConfigured } from "./client";

type DispatchResult = {
  workflowRunId: string;
  mode: "inngest" | "background";
};

async function sendOrBackground(
  eventName: string,
  data: Record<string, unknown>,
  runner: () => Promise<unknown>,
): Promise<DispatchResult> {
  const workflowRunId = data.workflowRunId as string;

  if (isInngestCloudConfigured()) {
    try {
      const { ids } = await inngest.send({ name: eventName, data });
      if (ids[0]) {
        await updateWorkflowRun(workflowRunId, { inngestEventId: ids[0] });
      }
      return { workflowRunId, mode: "inngest" };
    } catch (error) {
      logger.warn("Inngest send failed — falling back to background worker", {
        eventName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const runJob = () =>
    runner().catch((error) => {
      logger.error("Background workflow failed", {
        eventName,
        workflowRunId,
        message: error instanceof Error ? error.message : String(error),
      });
    });

  // Vercel freezes the lambda after the HTTP response — fire-and-forget jobs die at ~45%.
  // Await the runner on serverless so PRD/task/review workflows can finish.
  if (process.env.VERCEL === "1") {
    await runJob();
  } else {
    void runJob();
  }

  return { workflowRunId, mode: "background" };
}

export async function dispatchPrdGeneration(featureId: string, _userId: string) {
  const existing = await getActiveWorkflowOfType(featureId, "prd_generation");
  if (existing) {
    return { workflowRunId: existing.id, mode: "background" as const };
  }

  const run = await createWorkflowRun({
    featureRequestId: featureId,
    type: "prd_generation",
    message: "PRD generation queued…",
  });

  return sendOrBackground(
    INNGEST_EVENTS.prdGenerate,
    { featureId, workflowRunId: run.id, userId: _userId },
    () => runPrdGenerationWorkflow({ featureId, workflowRunId: run.id }),
  );
}

export async function dispatchTaskGeneration(featureId: string, _userId: string) {
  const existing = await getActiveWorkflowOfType(featureId, "task_generation");
  if (existing) {
    return { workflowRunId: existing.id, mode: "background" as const };
  }

  const run = await createWorkflowRun({
    featureRequestId: featureId,
    type: "task_generation",
    message: "Task generation queued…",
  });

  return sendOrBackground(
    INNGEST_EVENTS.tasksGenerate,
    { featureId, workflowRunId: run.id, userId: _userId },
    () => runTaskGenerationWorkflow({ featureId, workflowRunId: run.id }),
  );
}

const STALE_PENDING_MS = 90_000;

/** Re-run background workers for workflow runs stuck in pending (e.g. Inngest never picked up). */
export async function recoverStaleWorkflowRuns(featureId: string, userId?: string) {
  const runs = await listWorkflowRunsForFeature(featureId);
  const stale = runs.filter(
    (r) =>
      r.status === "pending" &&
      Date.now() - r.createdAt.getTime() > STALE_PENDING_MS,
  );

  for (const run of stale) {
    logger.warn("Recovering stale pending workflow", { workflowRunId: run.id, type: run.type });
    switch (run.type) {
      case "prd_generation":
        void runPrdGenerationWorkflow({ featureId, workflowRunId: run.id }).catch((error) => {
          logger.error("Stale PRD recovery failed", {
            workflowRunId: run.id,
            message: error instanceof Error ? error.message : String(error),
          });
        });
        break;
      case "task_generation":
        void runTaskGenerationWorkflow({ featureId, workflowRunId: run.id }).catch((error) => {
          logger.error("Stale task recovery failed", {
            workflowRunId: run.id,
            message: error instanceof Error ? error.message : String(error),
          });
        });
        break;
      case "ai_review":
        if (userId) {
          void runAiReviewWorkflow({ featureId, userId, workflowRunId: run.id }).catch((error) => {
            logger.error("Stale AI review recovery failed", {
              workflowRunId: run.id,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }
        break;
      default:
        break;
    }
  }
}

export async function dispatchAiReview(featureId: string, userId: string) {
  const existing = await getActiveWorkflowOfType(featureId, "ai_review");
  if (existing) {
    return { workflowRunId: existing.id, mode: "background" as const };
  }

  const run = await createWorkflowRun({
    featureRequestId: featureId,
    type: "ai_review",
    message: "AI review queued…",
  });

  return sendOrBackground(
    INNGEST_EVENTS.aiReview,
    { featureId, workflowRunId: run.id, userId },
    () => runAiReviewWorkflow({ featureId, userId, workflowRunId: run.id }),
  );
}

export { inngestFunctions } from "./functions";
export { inngest, isInngestCloudConfigured, INNGEST_EVENTS } from "./client";
