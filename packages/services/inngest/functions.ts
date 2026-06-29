import { inngest, INNGEST_EVENTS } from "./client";
import { runPrdGenerationWorkflow } from "../workflows/prd-generation";
import { runTaskGenerationWorkflow } from "../workflows/task-generation";
import { runAiReviewWorkflow } from "../workflows/ai-review-workflow";
import { runCodeImplementationWorkflow } from "../workflows/code-implementation";

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

export const codeImplementFunction = inngest.createFunction(
  { id: "shipflow-code-implement", name: "AI code implementation" },
  { event: INNGEST_EVENTS.codeImplement },
  async ({ event, step }) => {
    return step.run("code-implement", () =>
      runCodeImplementationWorkflow({
        featureId: event.data.featureId,
        userId: event.data.userId,
        organizationId: event.data.organizationId,
        installationId: event.data.installationId,
        repositoryId: event.data.repositoryId,
        workflowRunId: event.data.workflowRunId,
      }),
    );
  },
);

export const inngestFunctions = [
  generatePrdFunction,
  generateTasksFunction,
  aiReviewFunction,
  codeImplementFunction,
];
