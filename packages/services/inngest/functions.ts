import { inngest, INNGEST_EVENTS } from "./client";
import { runPrdGenerationWorkflow } from "../workflows/prd-generation";
import { runTaskGenerationWorkflow } from "../workflows/task-generation";
import { runAiReviewWorkflow } from "../workflows/ai-review-workflow";

export const generatePrdFunction = inngest.createFunction(
  { id: "shipflow-generate-prd", name: "Generate PRD" },
  { event: INNGEST_EVENTS.prdGenerate },
  async ({ event, step }) => {
    return step.run("generate-prd", () =>
      runPrdGenerationWorkflow({
        featureId: event.data.featureId,
        workflowRunId: event.data.workflowRunId,
      }),
    );
  },
);

export const generateTasksFunction = inngest.createFunction(
  { id: "shipflow-generate-tasks", name: "Generate engineering tasks" },
  { event: INNGEST_EVENTS.tasksGenerate },
  async ({ event, step }) => {
    return step.run("generate-tasks", () =>
      runTaskGenerationWorkflow({
        featureId: event.data.featureId,
        workflowRunId: event.data.workflowRunId,
      }),
    );
  },
);

export const aiReviewFunction = inngest.createFunction(
  { id: "shipflow-ai-review", name: "AI code review" },
  { event: INNGEST_EVENTS.aiReview },
  async ({ event, step }) => {
    return step.run("ai-review", () =>
      runAiReviewWorkflow({
        featureId: event.data.featureId,
        userId: event.data.userId,
        workflowRunId: event.data.workflowRunId,
      }),
    );
  },
);

export const inngestFunctions = [generatePrdFunction, generateTasksFunction, aiReviewFunction];
