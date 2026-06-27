import { describe, expect, it } from "vitest";

import { normalizeTitle, titleSimilarity } from "./feature-education";

describe("feature-education similarity", () => {
  it("normalizes titles for comparison", () => {
    expect(normalizeTitle("  OAuth Login!!! ")).toBe("oauth login");
    expect(normalizeTitle("CSV   Export")).toBe("csv export");
  });

  it("scores exact and substring matches highly", () => {
    expect(titleSimilarity("OAuth login", "oauth login")).toBe(1);
    expect(titleSimilarity("Enterprise OAuth login", "OAuth login")).toBeGreaterThan(0.85);
  });

  it("scores word overlap for related titles", () => {
    expect(titleSimilarity("OAuth login for enterprise", "Enterprise OAuth login")).toBeGreaterThan(0.6);
  });

  it("scores unrelated titles low", () => {
    expect(titleSimilarity("CSV export for audit", "Slack alert when PR merges")).toBeLessThan(0.45);
  });
});
