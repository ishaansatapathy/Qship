import { describe, expect, it } from "vitest";

import { extractTaskKeywords } from "./repo-context";

describe("extractTaskKeywords", () => {
  it("filters stop words and short tokens", () => {
    const keywords = extractTaskKeywords(
      "Add Slack notification when PR is approved",
      "Implement webhook handler and send message to Slack channel using OAuth token",
    );
    expect(keywords).toContain("slack");
    expect(keywords).toContain("notification");
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.every((k) => k.length >= 4)).toBe(true);
  });

  it("deduplicates repeated words", () => {
    const keywords = extractTaskKeywords("notification notification", "notification service");
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  it("respects max keyword limit", () => {
    const keywords = extractTaskKeywords(
      "alpha beta gamma delta epsilon zeta eta theta",
      "iota kappa lambda mu nu xi omicron pi rho",
      3,
    );
    expect(keywords.length).toBeLessThanOrEqual(3);
  });
});
