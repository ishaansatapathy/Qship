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

export type FeatureTaskDraft = {
  title: string;
  description: string;
  status: "backlog" | "todo";
};

export type FeatureAiReview = {
  summary: string;
  findings: string[];
  recommendation: string;
  pass: boolean;
  severity: "low" | "medium" | "high";
};

export type PrReviewIssue = {
  severity: "blocking" | "non_blocking";
  category: string;
  title: string;
  description: string;
  filePath?: string;
  lineNumber?: string;
  requirementRef?: string;
};

export type PrAiReviewResult = FeatureAiReview & {
  issues: PrReviewIssue[];
};

export async function generateFeatureTasks(input: {
  title: string;
  rawRequest: string;
  prd: PrdContent;
}) {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are an engineering lead breaking a PRD into shippable engineering tasks.
Return JSON with key "tasks": array of { title (short), description (1-2 sentences), status ("todo" or "backlog") }.
Produce 4-8 tasks ordered for delivery. First task should be todo; rest can be backlog.`,
      },
      {
        role: "user",
        content: `Feature: ${input.title}\n\nRequest:\n${input.rawRequest}\n\nPRD:\n${JSON.stringify(input.prd, null, 2)}`,
      },
    ],
    { jsonObject: true, temperature: 0.2 },
  );

  const parsed = parseJson<{ tasks: FeatureTaskDraft[] }>(content);
  return parsed.tasks ?? [];
}

export async function runFeatureAiReview(input: {
  title: string;
  rawRequest: string;
  prd?: PrdContent | null;
  taskTitles?: string[];
}) {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a senior engineer doing a pre-ship code/design review for a feature delivery pipeline.
Return JSON: summary (1-2 sentences), findings (array of specific issues or gaps), recommendation (next step),
pass (boolean — true if ready for human approval), severity (low|medium|high).
Be constructive and specific to the feature — not generic advice.`,
      },
      {
        role: "user",
        content: [
          `Feature: ${input.title}`,
          `Request: ${input.rawRequest}`,
          input.prd ? `PRD: ${JSON.stringify(input.prd, null, 2)}` : "PRD: not yet generated",
          input.taskTitles?.length ? `Tasks: ${input.taskTitles.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    { jsonObject: true, temperature: 0.15 },
  );

  return parseJson<FeatureAiReview>(content);
}

export async function runPrAiReview(input: {
  title: string;
  rawRequest: string;
  prd?: PrdContent | null;
  taskTitles?: string[];
  diffText: string;
  prTitle?: string;
  changedFiles?: string[];
}) {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a senior engineer reviewing a pull request against product requirements.
Return JSON with keys:
- summary (1-2 sentences)
- findings (array of short strings — legacy flat list)
- recommendation (next step for the team)
- pass (boolean — true only if no blocking issues and requirements are met)
- severity (low|medium|high)
- issues (array of { severity: "blocking"|"non_blocking", category, title, description, filePath?, lineNumber?, requirementRef? })

Evaluate PRD fit, acceptance criteria, security, edge cases, and code quality from the diff.
Be specific — cite files when possible.`,
      },
      {
        role: "user",
        content: [
          `Feature: ${input.title}`,
          `Request: ${input.rawRequest}`,
          input.prTitle ? `PR title: ${input.prTitle}` : "",
          input.changedFiles?.length ? `Changed files: ${input.changedFiles.join(", ")}` : "",
          input.prd ? `PRD: ${JSON.stringify(input.prd, null, 2)}` : "PRD: not available",
          input.taskTitles?.length ? `Tasks: ${input.taskTitles.join("; ")}` : "",
          "",
          "=== PULL REQUEST DIFF ===",
          input.diffText || "(empty diff)",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    { jsonObject: true, temperature: 0.1 },
  );

  const parsed = parseJson<PrAiReviewResult>(content);
  return {
    ...parsed,
    issues: parsed.issues ?? [],
    findings: parsed.findings ?? [],
  };
}
