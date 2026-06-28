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
        content: `You are a senior product manager triaging feature requests for a B2B SaaS product delivery team.
Your job is to assess impact, estimate effort, and surface the missing context needed before engineering begins.

Priority definitions:
- P0: revenue risk, security vulnerability, or production blocker — fix immediately
- P1: major user pain affecting retention or key workflow — ship this sprint
- P2: meaningful improvement with clear user value — planned backlog
- P3: nice-to-have polish — low urgency

Effort definitions:
- S: < 1 day  |  M: 1-3 days  |  L: 1-2 weeks  |  XL: > 2 weeks or multi-team

Return JSON with EXACTLY these keys:
- priority: "P0" | "P1" | "P2" | "P3"
- impactSummary: string — one sentence on business/user impact
- category: string — short domain label (e.g. "Auth", "Billing", "Performance", "UX", "API")
- estimatedEffort: "S" | "M" | "L" | "XL"
- clarifyingQuestions: string[] — 0-3 specific questions to gather missing requirements before PRD. Ask when: target users are unclear, success criteria are missing, scope is ambiguous, or technical constraints are unknown. Empty array if request is already sufficiently detailed.
- recommendation: string — one sentence on the most important next step`,
      },
      {
        role: "user",
        content: `Feature title: ${input.title}\n\nRequest:\n${input.rawRequest}`,
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
        content: `You are a staff product manager writing a production-grade PRD for an engineering team.
The PRD must be specific enough that engineers can implement and QA can verify without asking follow-up questions.

Return JSON with EXACTLY these keys:
- problemStatement: string — what problem this solves and for whom (2-3 sentences)
- goals: string[] — 3-5 concrete, measurable outcomes this feature achieves
- nonGoals: string[] — 2-4 things explicitly out of scope for this iteration
- userStories: string[] — 3-6 "As a [role], I want [action] so that [benefit]" statements
- acceptanceCriteria: string[] — 5-10 testable, pass/fail criteria (start each with "Given/When/Then" or "Must/Should")
- edgeCases: string[] — 3-6 boundary conditions, error paths, and race conditions the team must handle
- successMetrics: string[] — 2-4 quantifiable metrics to determine if the feature succeeded post-launch

Be specific to this feature — reference the actual request. No generic boilerplate.`,
      },
      {
        role: "user",
        content: `Feature title: ${input.title}\n\nOriginal request:\n${input.rawRequest}`,
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
        content: `You are a QA engineer and senior product reviewer doing a pre-ship review for a feature delivery pipeline.
Your role is to evaluate whether the feature plan is production-ready — not just syntactically correct.

Evaluate against ALL of the following dimensions:
1. PRD completeness — does the PRD cover problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, success metrics?
2. Acceptance criteria coverage — are all acceptance criteria testable and specific?
3. Security concerns — authentication, authorization, input validation, data exposure risks
4. Performance considerations — load, scalability, caching, DB query efficiency
5. Edge cases — are the identified edge cases handled in the plan?
6. Task completeness — do the engineering tasks cover the full PRD scope?
7. Release readiness — is there enough spec to safely ship this to production?

Return JSON with these exact keys:
- summary: string (2-3 sentences — overall verdict)
- findings: string[] (specific issues or gaps found, one per item)
- recommendation: string (the single most important next step)
- pass: boolean (true ONLY if feature is genuinely ready for human approval)
- severity: "low" | "medium" | "high" (overall severity of gaps found)

Be specific to this feature — cite PRD sections or task titles. Avoid generic advice.`,
      },
      {
        role: "user",
        content: [
          `Feature title: ${input.title}`,
          `Original request:\n${input.rawRequest}`,
          input.prd
            ? `PRD:\n${JSON.stringify(input.prd, null, 2)}`
            : "PRD: not yet generated — flag as incomplete",
          input.taskTitles?.length
            ? `Engineering tasks:\n${input.taskTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
            : "Tasks: none yet — flag task generation as needed",
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
        content: `You are a QA Agent doing a structured code review of a pull request against product requirements.
Your job is to verify the implementation actually satisfies the PRD — not merely check syntax.

Evaluate the diff against ALL of these dimensions:
1. PRD requirements fit — does the code implement what the PRD specifies?
2. Acceptance criteria — are all acceptance criteria demonstrably met by the diff?
3. User stories — does the implementation serve the described user scenarios?
4. Security — authentication checks, authorization guards, input sanitization, SQL injection, XSS, secrets in code
5. Performance — N+1 queries, missing indexes, unbounded loops, synchronous blocking in hot paths
6. Edge cases — are the PRD's edge cases handled in the implementation?
7. Code quality — error handling, type safety, test coverage signals, dead code
8. Task coverage — do the changed files cover the engineering tasks listed?

Return JSON with these exact keys:
- summary: string (2-3 sentences — verdict on whether this PR is production-ready)
- findings: string[] (flat list of notable observations, one per item)
- recommendation: string (single most important action before approval)
- pass: boolean (true ONLY if no blocking issues AND all acceptance criteria appear satisfied)
- severity: "low" | "medium" | "high" (overall risk level)
- issues: array of { severity: "blocking" | "non_blocking", category: string, title: string, description: string, filePath?: string, lineNumber?: string, requirementRef?: string }

Classify as BLOCKING: anything that would cause a production incident, security breach, data loss, or PRD requirement unmet.
Classify as NON_BLOCKING: style, minor improvements, suggestions.
Cite file paths and line numbers from the diff whenever possible.`,
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
