import { describe, expect, it } from "vitest";

import { isGlobalRateLimitExempt } from "./rate-limiters";

describe("isGlobalRateLimitExempt", () => {
  it("exempts health, readiness, and root probes", () => {
    expect(isGlobalRateLimitExempt("/health")).toBe(true);
    expect(isGlobalRateLimitExempt("/ready")).toBe(true);
    expect(isGlobalRateLimitExempt("/")).toBe(true);
  });

  it("exempts Scalar docs and OpenAPI JSON for judges and CI smoke", () => {
    expect(isGlobalRateLimitExempt("/docs")).toBe(true);
    expect(isGlobalRateLimitExempt("/docs/getting-started")).toBe(true);
    expect(isGlobalRateLimitExempt("/openapi.json")).toBe(true);
  });

  it("rate-limits mutating API traffic", () => {
    expect(isGlobalRateLimitExempt("/trpc/feature.approve")).toBe(false);
    expect(isGlobalRateLimitExempt("/api/feature/requests")).toBe(false);
    expect(isGlobalRateLimitExempt("/mcp")).toBe(false);
  });
});
