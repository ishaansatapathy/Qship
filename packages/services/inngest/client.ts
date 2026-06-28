import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "shipflow-ai",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export const INNGEST_EVENTS = {
  prdGenerate: "shipflow/prd.generate",
  tasksGenerate: "shipflow/tasks.generate",
  aiReview: "shipflow/ai.review",
} as const;

/**
 * Inngest cloud is opt-in. Without INNGEST_USE_CLOUD=true we run workflows
 * in-process so PRD/task/review jobs work on a single API deployment without
 * requiring the Inngest dashboard sync.
 */
export function isInngestCloudConfigured() {
  return (
    process.env.INNGEST_USE_CLOUD === "true" &&
    Boolean(process.env.INNGEST_EVENT_KEY?.trim()) &&
    Boolean(process.env.INNGEST_SIGNING_KEY?.trim())
  );
}
