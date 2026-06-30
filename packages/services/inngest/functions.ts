import { inngest, INNGEST_EVENTS } from "./client";
import { runPrdAiStep, runPrdPersistStep } from "../workflows/prd-generation";
import { runTaskAiStep, runTaskPersistStep } from "../workflows/task-generation";
import { runAiReviewStep, runAiReviewPersistStep } from "../workflows/ai-review-workflow";
import { runCodeImplementationWorkflow } from "../workflows/code-implementation";
import { processGithubWebhookOutbox } from "../github/webhook-outbox";

/**
 * PRD generation — split into two checkpoints so a DB failure on persist
 * does NOT re-run the OpenAI call on retry.
 *
 * step 1 "prd-ai-call"     — calls OpenAI, returns the PRD content (memoised)
 * step 2 "prd-db-persist"  — writes PRD to DB and transitions FSM status
 */
export const generatePrdFunction = inngest.createFunction(
  { id: "shipflow-generate-prd", name: "Generate PRD" },
  { event: INNGEST_EVENTS.prdGenerate },
  async ({ event, step }) => {
    const input = {
      featureId: event.data.featureId,
      workflowRunId: event.data.workflowRunId,
    };

    // Step 1: AI call (idempotent — result memoised by Inngest on retry)
    const prdContent = await step.run("prd-ai-call", () => runPrdAiStep(input));

    // Step 2: DB persist (safe to retry independently)
    return step.run("prd-db-persist", () => runPrdPersistStep(input, prdContent));
  },
);

/**
 * Task generation — two checkpoints: AI call + DB persist.
 */
export const generateTasksFunction = inngest.createFunction(
  { id: "shipflow-generate-tasks", name: "Generate engineering tasks" },
  { event: INNGEST_EVENTS.tasksGenerate },
  async ({ event, step }) => {
    const input = {
      featureId: event.data.featureId,
      workflowRunId: event.data.workflowRunId,
    };

    const tasks = await step.run("tasks-ai-call", () => runTaskAiStep(input));
    return step.run("tasks-db-persist", () => runTaskPersistStep(input, tasks));
  },
);

/**
 * AI review — two checkpoints: AI analysis + DB persist.
 * On retry after a DB failure the expensive AI call is NOT re-run.
 */
export const aiReviewFunction = inngest.createFunction(
  { id: "shipflow-ai-review", name: "AI code review" },
  { event: INNGEST_EVENTS.aiReview },
  async ({ event, step }) => {
    const input = {
      featureId: event.data.featureId,
      userId: event.data.userId,
      workflowRunId: event.data.workflowRunId,
    };

    const reviewResult = await step.run("ai-review-call", () => runAiReviewStep(input));
    return step.run("ai-review-persist", () => runAiReviewPersistStep(input, reviewResult));
  },
);

/**
 * Code implementation — single step (GitHub commit is already idempotent via
 * branch existence check; splitting would require storing large generated file
 * payloads in Inngest state which exceeds the 4 MB event size limit).
 */
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

/** Drains failed GitHub webhook deliveries from Postgres outbox (every 2 minutes). */
export const githubWebhookOutboxFunction = inngest.createFunction(
  { id: "shipflow-github-webhook-outbox", name: "Process GitHub webhook outbox" },
  { cron: "*/2 * * * *" },
  async ({ step }) => {
    const processed = await step.run("process-github-webhook-outbox", () =>
      processGithubWebhookOutbox(25),
    );
    return { processed };
  },
);

export const inngestFunctions = [
  generatePrdFunction,
  generateTasksFunction,
  aiReviewFunction,
  codeImplementFunction,
  githubWebhookOutboxFunction,
];
