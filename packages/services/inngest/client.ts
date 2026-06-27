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

export function isInngestCloudConfigured() {
  return Boolean(process.env.INNGEST_EVENT_KEY?.trim());
}
