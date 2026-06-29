import type { PrAiReviewResult } from "../feature-ai";

/** Minimal passing AI review payload for integration tests. */
export function buildPassingAiReview(overrides?: Partial<PrAiReviewResult>): PrAiReviewResult {
  return {
    pass: true,
    summary: "All acceptance criteria met.",
    findings: [],
    recommendation: "approve",
    severity: "low",
    checklistResults: [{ dimension: "acceptance", pass: true, note: "Criteria satisfied" }],
    issues: [],
    ...overrides,
  };
}
