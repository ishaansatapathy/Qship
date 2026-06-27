import { logger } from "@repo/logger";

import { createWorkflowRun, updateWorkflowRun } from "../workflow-runs";
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

  void runner().catch((error) => {
    logger.error("Background workflow failed", {
      eventName,
      workflowRunId,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return { workflowRunId, mode: "background" };
}

export async function dispatchPrdGeneration(featureId: string, _userId: string) {
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

export async function dispatchAiReview(featureId: string, userId: string) {
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
