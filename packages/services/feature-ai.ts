import type { PrdContent } from "@repo/database/schema";

import { ServiceError } from "./errors";
import { createChatCompletion, isOpenAiConfigured } from "./ai/openai";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function requireOpenAi() {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ServiceError("INTERNAL", "AI returned invalid JSON. Try again.");
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type FeatureTriage = {
  priority: "P0" | "P1" | "P2" | "P3";
  impactSummary: string;
  category: string;
  estimatedEffort: "S" | "M" | "L" | "XL";
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: string[];
  clarifyingQuestions: string[];
  recommendation: string;
  stakeholderImpact: string;
  breakingChangeRisk: boolean;
};

export type FeatureTaskDraft = {
  title: string;
  description: string;
  status: "backlog" | "todo";
  type: "backend" | "frontend" | "infra" | "testing" | "docs" | "design";
  acceptanceCriteria: string[];
};

export type FeatureAiReview = {
  summary: string;
  findings: string[];
  recommendation: string;
  pass: boolean;
  severity: "low" | "medium" | "high";
  checklistResults: Array<{
    dimension: string;
    pass: boolean;
    note: string;
  }>;
};

export type PrReviewIssue = {
  severity: "blocking" | "non_blocking";
  category: string;
  title: string;
  description: string;
  suggestion?: string;
  filePath?: string;
  lineNumber?: string;
  requirementRef?: string;
};

export type PrAiReviewResult = FeatureAiReview & {
  issues: PrReviewIssue[];
};

export type ReviewDelta = {
  resolvedIssues: string[];
  newIssues: string[];
  persistingIssues: string[];
  overallProgress: "improved" | "same" | "regressed";
  iterationSummary: string;
};

// ── AI functions ───────────────────────────────────────────────────────────────

/**
 * Triages a feature request with priority, effort estimate, risk assessment,
 * stakeholder impact, and clarifying questions.
 */
export async function triageFeatureRequest(input: {
  title: string;
  rawRequest: string;
}) {
  requireOpenAi();

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a Staff Product Manager at a fast-growing B2B SaaS company triaging incoming feature requests.
Your job is to assess impact, estimate effort, identify risks, and surface missing requirements before engineering begins.

Priority matrix (urgency × impact):
- P0: Revenue at risk, security vulnerability, production blocker, compliance violation → fix immediately, no sprint planning needed
- P1: Major user pain affecting retention, core workflow blocked, competitive risk → ship this sprint, dedicated engineering
- P2: Meaningful improvement with clear user value, business case exists → planned backlog, next 1-2 sprints
- P3: Nice-to-have polish, low user impact, convenience improvement → low-priority backlog

Effort calibration (for a typical 3-person full-stack team):
- S: < 1 day — config change, copy edit, minor UI tweak
- M: 1–3 days — new API endpoint, UI component, DB column
- L: 1–2 weeks — new feature area, integration, significant refactor
- XL: > 2 weeks — major architecture change, multi-system coordination, new product surface

Risk factors to identify:
- Data migration (schema change, historical data transform)
- Third-party integration dependency
- Breaking API change affecting external consumers
- Authentication/authorization surface expansion
- Performance bottleneck at scale
- Compliance (GDPR, SOC2, HIPAA) implications
- Cross-team coordination required

Return JSON with EXACTLY these keys:
- priority: "P0" | "P1" | "P2" | "P3"
- impactSummary: string — one sentence on business/user impact (be specific, cite the request)
- category: string — domain label (Auth, Billing, Performance, UX, API, Data, Security, Notifications, Integrations)
- estimatedEffort: "S" | "M" | "L" | "XL"
- riskLevel: "low" | "medium" | "high" | "critical"
- riskFactors: string[] — concrete risks (empty if low-risk)
- breakingChangeRisk: boolean — true if this could break existing API consumers or data flows
- stakeholderImpact: string — who is affected and how (engineering, sales, customers, ops, compliance)
- clarifyingQuestions: string[] — 0–4 specific questions to gather missing requirements. Ask when: target users are unclear, success criteria are missing, scope is ambiguous, edge cases are unspecified, or technical constraints are unknown. Empty if request is already sufficiently detailed.
- recommendation: string — the single most important next step (what should happen TODAY)

Be specific to this request. Avoid generic advice.`,
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

/**
 * Generates a production-grade PRD with technical requirements, security
 * considerations, testing strategy, and rollback plan.
 */
export async function generateFeaturePrd(input: { title: string; rawRequest: string; clarifications?: string[] }) {
  requireOpenAi();

  const clarificationBlock = input.clarifications?.length
    ? `\n\nClarifications answered:\n${input.clarifications.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
    : "";

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a Staff Product Manager writing a production-grade PRD for an engineering team at a B2B SaaS company.
The PRD must be specific enough that engineers can implement, QA can verify, and the security team can audit — without follow-up questions.

Return JSON with EXACTLY these keys:
- problemStatement: string — what problem this solves, for whom, and why now (2–3 sentences, cite user pain)
- goals: string[] — 3–5 concrete, measurable outcomes (use "Enable...", "Reduce...", "Increase..." with quantifiable targets where possible)
- nonGoals: string[] — 2–4 things explicitly out of scope for this iteration (prevents scope creep)
- userStories: string[] — 4–7 "As a [specific role], I want [specific action] so that [specific benefit]" statements
- acceptanceCriteria: string[] — 6–12 testable pass/fail criteria (format: "Given [context], when [action], then [expected result]")
- technicalRequirements: string[] — 3–6 implementation constraints: API contracts, data schema impacts, performance budgets (e.g., "p95 < 200ms"), backwards compatibility rules, auth requirements
- edgeCases: string[] — 4–8 boundary conditions, error paths, race conditions, and failure modes the team must handle
- securityRequirements: string[] — 2–5 specific security controls required (auth checks, input validation, rate limiting, data classification, audit logging)
- testingStrategy: string[] — 3–6 test scenarios covering happy path, failure paths, and boundary conditions
- successMetrics: string[] — 2–4 quantifiable metrics to determine if the feature succeeded post-launch (with baseline + target)
- rollbackPlan: string — how to safely disable or revert this feature if it causes production issues

Be specific to this feature — reference the actual request and user context. No generic boilerplate.`,
      },
      {
        role: "user",
        content: `Feature title: ${input.title}\n\nOriginal request:\n${input.rawRequest}${clarificationBlock}`,
      },
    ],
    { jsonObject: true, temperature: 0.2 },
  );

  return parseJson<PrdContent>(content);
}

/**
 * Breaks a PRD into ordered engineering tasks with type classification,
 * rich descriptions, and per-task acceptance criteria.
 */
export async function generateFeatureTasks(input: {
  title: string;
  rawRequest: string;
  prd: PrdContent;
}) {
  requireOpenAi();

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are an engineering lead breaking a PRD into shippable, well-scoped engineering tasks.

Task ordering rules:
1. Infrastructure/schema changes first (DB migrations, API contracts)
2. Backend business logic second
3. Frontend/UI third
4. Tests fourth (unit + integration per feature area)
5. Documentation last (only if user-facing or API docs needed)

Return JSON with key "tasks": array of task objects with EXACTLY these keys per task:
- title: string — short, imperative (max 60 chars, e.g. "Add rate limiting to auth endpoints")
- description: string — 2–4 sentences explaining what to build, why it matters, and specific implementation notes (file paths, function names, APIs to call)
- status: "todo" (first 2 tasks) | "backlog" (remaining)
- type: "backend" | "frontend" | "infra" | "testing" | "docs" | "design"
- acceptanceCriteria: string[] — 2–4 specific pass/fail criteria for this task only

Produce 5–9 tasks. Every PRD must have at least one "testing" task. Do not duplicate work across tasks.
Reference specific PRD acceptance criteria in task descriptions where applicable.`,
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

/**
 * Pre-ship feature review: evaluates PRD completeness, task coverage, security,
 * and release readiness against 8 structured dimensions.
 */
export async function runFeatureAiReview(input: {
  title: string;
  rawRequest: string;
  prd?: PrdContent | null;
  taskTitles?: string[];
}) {
  requireOpenAi();

  const prdText = input.prd
    ? JSON.stringify(input.prd, null, 2)
    : "PRD: NOT GENERATED — flag as incomplete and fail";

  const tasksText = input.taskTitles?.length
    ? input.taskTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "Tasks: NONE — flag task generation as required and fail";

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a QA Director and Senior Product Reviewer running a structured pre-ship gate review.
Your goal: determine if this feature plan is ready for engineering to begin and human PM approval.

Evaluate ALL 8 dimensions. Score each pass or fail with a specific note:

1. PRD COMPLETENESS — Does the PRD have: problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, success metrics?
2. ACCEPTANCE CRITERIA QUALITY — Are criteria testable, specific, and binary (pass/fail)? Not vague ("should be fast")?
3. SECURITY & AUTH — Are authentication, authorization, input validation, and data classification addressed?
4. PERFORMANCE — Are response time budgets, database query patterns, and caching strategies considered?
5. EDGE CASES — Do PRD edge cases cover: concurrent users, empty states, network failures, invalid inputs, large datasets?
6. TASK COMPLETENESS — Do engineering tasks cover ALL acceptance criteria? Is there a testing task?
7. ROLLBACK & RISK — Is there a rollback plan? Are breaking changes and data migrations accounted for?
8. RELEASE READINESS — Could this be shipped safely TODAY with a reasonable implementation?

Return JSON with EXACTLY these keys:
- summary: string — 2–3 sentences: overall verdict with strongest argument for the pass/fail decision
- findings: string[] — specific gaps or risks found, one per item (cite PRD sections or task titles). Empty if pass=true.
- recommendation: string — the single most important action to take RIGHT NOW
- pass: boolean — true ONLY if all 8 dimensions pass or have negligible gaps
- severity: "low" | "medium" | "high" — overall severity of all gaps combined
- checklistResults: array of { dimension: string, pass: boolean, note: string } — one entry per dimension above

Be specific to this feature. Cite exact PRD content. Never give generic advice like "add error handling".`,
      },
      {
        role: "user",
        content: [
          `Feature title: ${input.title}`,
          `Original request:\n${input.rawRequest}`,
          `PRD:\n${prdText}`,
          `Engineering tasks:\n${tasksText}`,
        ].join("\n\n"),
      },
    ],
    { jsonObject: true, temperature: 0.15 },
  );

  const parsed = parseJson<FeatureAiReview>(content);
  return {
    ...parsed,
    findings: parsed.findings ?? [],
    checklistResults: parsed.checklistResults ?? [],
  };
}

/**
 * Full PR code review: verifies the implementation against the PRD, acceptance
 * criteria, and a structured 9-dimension checklist. Returns blocking/non-blocking
 * issues with file paths and suggestions.
 */
export async function runPrAiReview(input: {
  title: string;
  rawRequest: string;
  prd?: PrdContent | null;
  taskTitles?: string[];
  diffText: string;
  prTitle?: string;
  changedFiles?: string[];
}) {
  requireOpenAi();

  const prdJson = input.prd ? JSON.stringify(input.prd, null, 2) : "Not available";
  const tasksText = input.taskTitles?.length
    ? input.taskTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "None";

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are an expert Staff Engineer acting as an AI Code Review Agent for a B2B SaaS delivery pipeline.
Your role is to verify that the code diff correctly and safely implements the PRD — not merely check syntax.

Evaluate the diff across ALL 9 dimensions:

1. PRD REQUIREMENTS FIT — Does every acceptance criterion have corresponding code? Quote the criterion and the file.
2. SECURITY — Check for: missing auth guards, SQL injection, XSS, hardcoded secrets/tokens, CORS misconfig, missing rate limiting, IDOR, unvalidated user input, excessive permissions
3. PERFORMANCE — Check for: N+1 queries (loop + DB call), missing DB indexes for new query patterns, unbounded pagination, synchronous blocking in async handlers, large payload responses without pagination
4. ERROR HANDLING — Check for: unhandled promise rejections, missing try/catch on I/O, silent swallowed errors (empty catch blocks), no error logging
5. TYPE SAFETY — Check for: any types, type assertions (as unknown), missing null checks on DB results, implicit any function parameters
6. TEST COVERAGE — Are there test files in the diff? Does the test coverage match the implementation? Flag if implementation adds new functions without corresponding tests.
7. EDGE CASES — Are the PRD edge cases handled in the code? Check empty arrays, null returns from DB, concurrent operations, idempotency for mutations
8. BACKWARDS COMPATIBILITY — Do changed API routes or function signatures break existing callers? Schema changes without migrations?
9. CODE QUALITY — Leftover console.logs, commented-out code, TODO comments that block merge, dead code, magic constants

BLOCKING issues (prevent merge): security vulnerabilities, data loss risk, unmet acceptance criteria, auth gaps, production crashes
NON_BLOCKING issues (should fix before ship): style, minor optimizations, missing tests for edge cases, suggestions

Return JSON with EXACTLY these keys:
- summary: string — 2–3 sentence verdict: is this PR production-ready? Cite specific evidence.
- findings: string[] — notable observations per dimension that don't rise to issues
- recommendation: string — the single most important action before this PR merges
- pass: boolean — true ONLY if zero blocking issues AND all acceptance criteria appear satisfied in the diff
- severity: "low" | "medium" | "high" — overall risk level of this PR as-is
- checklistResults: array of { dimension: string, pass: boolean, note: string } — one per dimension
- issues: array of {
    severity: "blocking" | "non_blocking",
    category: string (one of: Security, Performance, ErrorHandling, TypeSafety, Tests, EdgeCases, Compatibility, Requirements, CodeQuality),
    title: string (short, actionable),
    description: string (what the problem is and why it matters),
    suggestion: string (concrete fix suggestion),
    filePath?: string (exact file from the diff),
    lineNumber?: string (line number from the diff hunk if identifiable),
    requirementRef?: string (acceptance criterion this violates, verbatim)
  }

Cite file paths and line numbers from the diff whenever identifiable. Be specific — "Missing null check on line 42 of auth.ts" not "add null checks".`,
      },
      {
        role: "user",
        content: [
          `Feature: ${input.title}`,
          `Request: ${input.rawRequest}`,
          input.prTitle ? `PR title: ${input.prTitle}` : "",
          input.changedFiles?.length
            ? `Changed files (${input.changedFiles.length}):\n${input.changedFiles.join("\n")}`
            : "",
          `PRD:\n${prdJson}`,
          `Engineering tasks:\n${tasksText}`,
          "",
          "=== PULL REQUEST DIFF ===",
          input.diffText || "(empty diff — flag all acceptance criteria as unverified)",
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
    checklistResults: parsed.checklistResults ?? [],
  };
}

/**
 * Delta-aware re-review: explicitly checks whether issues from a previous
 * iteration were resolved, and identifies any regressions or new issues.
 * Use this instead of `runPrAiReview` for iterations > 1.
 */
export async function runDeltaAiReview(input: {
  title: string;
  rawRequest: string;
  prd?: PrdContent | null;
  taskTitles?: string[];
  diffText: string;
  prTitle?: string;
  changedFiles?: string[];
  previousReview: {
    iteration: number;
    summary: string;
    blockingIssues: Array<{
      title: string;
      description: string;
      filePath?: string | null;
      category: string;
    }>;
  };
}): Promise<PrAiReviewResult> {
  requireOpenAi();

  const prevIssueList = input.previousReview.blockingIssues
    .map((i, n) => `${n + 1}. [${i.category}] ${i.title} (${i.filePath ?? "general"}): ${i.description}`)
    .join("\n");

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are an expert Staff Engineer doing a DELTA RE-REVIEW of a pull request.
This is iteration ${input.previousReview.iteration + 1} — the developer has pushed fixes after a prior AI review.

Your primary goal: verify which blocking issues from the previous review were actually fixed, and find any new issues introduced.

Previous review summary: "${input.previousReview.summary}"

Blocking issues from iteration ${input.previousReview.iteration} that must be checked:
${prevIssueList || "None — first review found no blocking issues"}

For EACH prior blocking issue, determine:
- RESOLVED: The diff shows the fix is in place and correct
- PARTIALLY_RESOLVED: Fix attempted but incomplete or incorrect
- UNRESOLVED: No change in the diff for this issue

Also perform a full review of the new diff for any NEW blocking or non-blocking issues.

Return JSON with EXACTLY these keys:
- summary: string — 2–3 sentences focused on what changed since the last review (progress made, what remains)
- findings: string[] — per-issue resolution status: "RESOLVED: [issue title]", "UNRESOLVED: [issue title] — [why still a problem]"
- recommendation: string — most important remaining action
- pass: boolean — true ONLY if ALL prior blocking issues are RESOLVED and no new blocking issues found
- severity: "low" | "medium" | "high"
- checklistResults: array of { dimension: string, pass: boolean, note: string } (same 9 dimensions as full review)
- issues: array of {
    severity: "blocking" | "non_blocking",
    category: string,
    title: string,
    description: string,
    suggestion: string,
    filePath?: string,
    lineNumber?: string,
    requirementRef?: string
  }

For unresolved prior issues, include them in issues[] with severity "blocking" and prepend "[UNRESOLVED from iteration ${input.previousReview.iteration}]" to the title.`,
      },
      {
        role: "user",
        content: [
          `Feature: ${input.title}`,
          input.prTitle ? `PR: ${input.prTitle}` : "",
          input.changedFiles?.length
            ? `Updated files:\n${input.changedFiles.join("\n")}`
            : "",
          input.prd ? `PRD:\n${JSON.stringify(input.prd, null, 2)}` : "",
          input.taskTitles?.length ? `Tasks:\n${input.taskTitles.join("\n")}` : "",
          "",
          "=== NEW DIFF (changes since last review) ===",
          input.diffText || "(no changes detected — all issues remain unresolved)",
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
    checklistResults: parsed.checklistResults ?? [],
  };
}
