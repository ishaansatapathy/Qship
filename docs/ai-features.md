# AI Features Deep-Dive

Qship uses **OpenAI `gpt-4o-mini`** via direct API calls (not Vercel AI SDK) for all AI functionality. Every call is wrapped in Zod schema validation, has a deterministic fallback, and is isolated in a typed service function.

**Primary file:** `packages/services/feature-ai.ts`

---

## Feature inventory

| # | Feature | Function | Trigger |
|---|---------|----------|---------|
| 1 | Requirement clarification | `triageFeatureRequest` | User submits request |
| 2 | Codebase-aware PRD generation | `generateFeaturePrd` + repo context | "Generate PRD" button / Inngest |
| 3 | Engineering task breakdown | `generateFeatureTasks` | After PRD approval |
| 4 | 9-dimension code review | `runPrAiReview` | "Run AI Review" / PR webhook |
| 5 | PRD vs PR acceptance criteria | (part of `runPrAiReview`) | Every review iteration |
| 6 | Delta re-review | `runDeltaAiReview` | Iteration ≥ 2 |
| 7 | Release readiness briefing | `generateApprovalBriefing` | Human review gate |
| 8 | AI Morning Brief | `generateAiBrief` (in pipeline-overview.ts) | `/overview` page load |
| 9 | Semantic duplicate detection | `detectSimilarFeatureRequests` | Pre-submit + autonomous sweep |
| 10 | GitHub Issues auto-intake | `triageFeatureRequest` (reused) | `issues.opened` webhook |
| 11 | Developer task walkthrough | `generateTaskWalkthroughStep` | "Explain in Agent" |
| 12 | AI Auto-Fix Code Patches | `generateBlockingIssueFixes` | After review with blocking issues |
| 13 | Auto Release Notes | `generateReleaseNotes` | On feature ship |
| 14 | Codebase-aware PRD repo scan | `fetchRepoSnippetsForTask` | PRD generation step |

---

## 1. Requirement Clarification (Triage)

**Function:** `triageFeatureRequest`

Runs when a feature request is submitted. The AI analyses the raw request text and returns:
- `priority`: P0–P3
- `effortEstimate`: XS–XL
- `riskAssessment`: low / medium / high
- `stakeholderImpact`: text
- `clarifyingQuestions`: 2–4 follow-up questions (only when context is genuinely missing)
- `isDuplicate`: boolean (coarse pre-check — semantic duplicate check runs separately)

**Prompt design:**
- System prompt instructs the AI to behave as a senior product manager, not a code generator
- Clarifying questions are only generated when the request is vague — well-specified requests get 0 questions
- The AI is explicitly told that "not every request needs to be built" and to flag existing capabilities

**Output validation:**
```typescript
const FeatureTriageSchema = z.object({
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  effortEstimate: z.enum(["XS", "S", "M", "L", "XL"]),
  // ...
});
```

---

## 2. Codebase-Aware PRD Generation

**Function:** `generateFeaturePrd` + `fetchRepoSnippetsForTask`

**Standard PRD sections:**
1. Problem statement
2. Goals (what success looks like)
3. Non-goals (explicitly out of scope)
4. User stories (`As a [role], I want [feature], so that [value]`)
5. Acceptance criteria (testable, specific)
6. Edge cases
7. Success metrics (measurable)
8. Technical requirements
9. Security requirements
10. Rollback plan

**Codebase-aware enhancement:**
Before generating the PRD, `fetchRepoSnippetsForTask` scans the linked GitHub repository:
1. Extracts keywords from the feature title and request
2. Uses GitHub's `search.code` API to find relevant files
3. Walks the repo tree (up to 500 nodes) with scoring against keywords
4. Fetches up to 5 most relevant file snippets (200 lines each, truncated)
5. Injects snippets into the PRD prompt as `[Relevant codebase context]`

This means the PRD mentions real file paths, existing patterns, and actual API conventions from the codebase — not generic boilerplate.

---

## 3. Engineering Task Breakdown

**Function:** `generateFeatureTasks`

Converts the PRD into 5–9 ordered engineering tasks:

```typescript
type EngineeringTask = {
  title: string;
  description: string;
  type: "backend" | "frontend" | "database" | "testing" | "devops";
  estimatedHours: number;
  acceptanceCriteria: string[];    // per-task checklist
  dependencies: string[];          // titles of tasks this depends on
  order: number;                   // execution order
}
```

Tasks are ordered by dependency — database migrations before backend, backend before frontend, testing last.

---

## 4. 9-Dimension Code Review

**Function:** `runPrAiReview`

Every code review evaluates the PR diff against **9 dimensions**:

| # | Dimension | What it checks |
|---|-----------|---------------|
| 1 | **Requirements fit** | Does the code satisfy the PRD? |
| 2 | **Acceptance criteria** | Is each PRD criterion met by the diff? |
| 3 | **Security** | Auth, input validation, injection risks, sensitive data |
| 4 | **Performance** | N+1 queries, unindexed lookups, blocking calls |
| 5 | **Error handling** | Unhandled exceptions, missing try/catch, silent failures |
| 6 | **Type safety** | `any` types, unsafe casts, missing null checks |
| 7 | **Tests** | Test coverage, missing edge cases, test quality |
| 8 | **Edge cases** | Boundary inputs, concurrent access, failure paths |
| 9 | **Code quality** | Readability, naming, duplication, over-engineering |

Each dimension produces:
```typescript
{ dimension: string, pass: boolean, note: string }
```

Issues are raised with:
- `severity`: `"blocking"` | `"non_blocking"`
- `filePath` + `lineNumber`: for inline GitHub annotations
- `requirementRef`: maps to a specific acceptance criterion
- `suggestion`: actionable fix recommendation

**The review FAILS (`pass: false`) if any blocking issue exists.** This is enforced server-side — the human approval gate checks `pass` and `unresolvedBlocking` before allowing approval.

---

## 5. PRD vs PR Acceptance Criteria Validation

Part of every `runPrAiReview` call. The prompt includes the full list of PRD acceptance criteria:

```
Acceptance criteria to validate:
1. User can upload files up to 100MB
2. Upload progress is shown in real-time
3. Files are scanned for malware before storage
...
```

The AI is instructed to reference each criterion by number in the `requirementRef` field of any issue it raises. If criterion 3 is not met, the issue will have `requirementRef: "3"` — making it traceable back to the exact product requirement.

---

## 6. Delta Re-Review

**Function:** `runDeltaAiReview`

When iteration ≥ 2, the AI is given:
- The **previous review** (which issues were blocking)
- The **new PR diff** (what changed since)

And asked to classify each previous blocking issue as:
- `RESOLVED` — code change addresses the issue
- `PARTIALLY_RESOLVED` — progress made but still incomplete
- `UNRESOLVED` — no meaningful change

This prevents rubber-stamping — the AI cannot pass a re-review unless it explicitly confirms each prior blocker was fixed.

---

## 7. Release Readiness Briefing

**Function:** `generateApprovalBriefing`

Generated when a feature reaches `human_review` status. Synthesises:
- PRD goals vs. what's in the diff
- Review history (how many iterations, were all blockers resolved)
- Open non-blocking warnings
- Security and performance assessment

Returns:
```typescript
{
  summary: string,
  keyThingsToVerify: string[],    // checklist for human reviewer
  remainingConcerns: string[],    // advisory warnings
  approvalRecommendation: "approve" | "hold" | "reject",
  confidence: number,             // 0.0–1.0
  riskLevel: "low" | "medium" | "high" | "critical",
  rationale: string,
}
```

---

## 8. AI Morning Brief

**Function:** `generateAiBrief` (in `packages/services/pipeline-overview.ts`)

Runs on every load of the `/overview` page. Receives:
- Pipeline counts by status
- Blocked features (blocking issues count)
- Features awaiting human review
- Stale features (no update > 7 days)
- Top action items (deterministically ranked)

Returns a 3–5 sentence natural language summary that a PM can read in 10 seconds to understand pipeline health.

**Fallback:** If the OpenAI call fails for any reason, `buildFallbackBrief` generates a deterministic text summary from the same data — the page never shows an error state.

---

## 9. Semantic Duplicate Detection

**Function:** `detectSimilarFeatureRequests`

Uses GPT to compare a new feature request against the active pipeline:

- Runs **pre-submit** (debounced, as the user types in the create form)
- Runs **post-create** in the autonomous hourly sweep

Returns:
```typescript
{
  hasSimilar: boolean,
  topCandidates: Array<{
    id: string,
    title: string,
    similarityReason: string,    // why they're similar
    consolidationSuggestion: string,
  }>,
  consolidationRecommendation: string,
}
```

If a potential duplicate is detected pre-submit, the create form shows a warning banner. The user can still submit (perhaps it genuinely is different) — AI is advisory.

---

## 10. AI Auto-Fix Code Patches

**Function:** `generateBlockingIssueFixes`

After a review finds blocking issues with a `filePath`, the AI generates unified-diff format patches:

```diff
--- a/src/api/upload.ts
+++ b/src/api/upload.ts
@@ -45,6 +45,10 @@
 async function handleUpload(req: Request) {
+  if (!req.user) {
+    throw new UnauthorizedError("Authentication required");
+  }
   const file = req.body.file;
```

- Detects the test framework from file extensions in the diff (jest, vitest, pytest, mocha)
- For missing tests: generates a complete test block in the detected framework
- Posted as a separate GitHub PR comment (upserted — never duplicated)
- Fire-and-forget — never blocks the review pipeline

---

## 11. Auto Release Notes Generator

**Function:** `generateReleaseNotes`

Triggered when a feature is shipped and the PR was merged. Uses:
- Feature title and raw request
- PRD content (problem statement, goals, rollback plan)
- PR diff summary (changed files, +/- line counts)

Generates:
```typescript
{
  version: string,               // e.g. "v1.2.0"
  title: string,                 // short release title
  summary: string,               // 2-sentence description
  whatChanged: string[],         // 3–6 bullet points
  breakingChanges: string[],     // API/schema changes (empty if none)
  testingInstructions: string,   // how to verify
  rollbackInstructions: string,  // how to revert safely
  markdownBody: string,          // GitHub Release ready markdown
}
```

Creates an actual **GitHub Release** via `octokit.rest.repos.createRelease`. A link to the release appears in the feature delivery timeline.

---

## Shared infrastructure

### OpenAI client

**File:** `packages/services/ai/openai-fetch.ts`

Direct `fetch`-based client — no SDK dependency:

```typescript
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({ model: "gpt-4o-mini", messages, response_format: { type: "json_object" } }),
});
```

All AI calls use `response_format: { type: "json_object" }` — the model is constrained to return parseable JSON, which feeds directly into Zod validation.

### Guard: `requireOpenAi()`

Every AI function starts with:
```typescript
function requireOpenAi() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ServiceError("CONFIGURATION_ERROR", "OPENAI_API_KEY is not set");
  }
}
```

This ensures a clear error (not a cryptic network failure) when the API key is missing.

### `parseJsonAs<T>(raw, schema)`

```typescript
function parseJsonAs<T>(raw: string, schema: z.ZodSchema<T>): T {
  const parsed = JSON.parse(raw);
  return schema.parse(parsed);  // throws ZodError on invalid
}
```

Every AI output goes through this. ZodErrors bubble up to the Inngest step as failures → retried automatically.
