import type { PrdContent } from "@repo/database/schema";

import { ServiceError } from "./errors";
import { createChatCompletion, isOpenAiConfigured } from "./ai/openai";

export type FeatureTriage = {
  priority: "P0" | "P1" | "P2" | "P3";
  impactSummary: string;
  category: string;
  estimatedEffort: "S" | "M" | "L" | "XL";
  clarifyingQuestions: string[];
  recommendation: string;
};

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ServiceError("INTERNAL", "AI returned invalid JSON. Try again.");
  }
}

export async function triageFeatureRequest(input: {
  title: string;
  rawRequest: string;
}) {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a senior product manager triaging employee feature requests for a B2B SaaS team.
Return JSON only with keys: priority (P0|P1|P2|P3), impactSummary (1 sentence), category (short label),
estimatedEffort (S|M|L|XL), clarifyingQuestions (array of 0-3 questions), recommendation (1 sentence on next step).
P0 = revenue/security blocker, P1 = major user pain, P2 = meaningful improvement, P3 = nice-to-have.`,
      },
      {
        role: "user",
        content: `Title: ${input.title}\n\nRequest:\n${input.rawRequest}`,
      },
    ],
    { jsonObject: true, temperature: 0.2 },
  );

  return parseJson<FeatureTriage>(content);
}

export async function generateFeaturePrd(input: { title: string; rawRequest: string }) {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a staff product manager writing a concise PRD for engineering.
Return JSON with keys: problemStatement, goals (string[]), nonGoals (string[]), userStories (string[]),
acceptanceCriteria (string[]), edgeCases (string[]), successMetrics (string[]).
Be specific and shippable — no fluff.`,
      },
      {
        role: "user",
        content: `Feature title: ${input.title}\n\nRaw request:\n${input.rawRequest}`,
      },
    ],
    { jsonObject: true, temperature: 0.25 },
  );

  return parseJson<PrdContent>(content);
}
