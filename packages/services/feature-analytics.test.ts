import { describe, expect, it } from "vitest";

import { derivePipelineHealthInsight } from "./feature-analytics";

describe("derivePipelineHealthInsight", () => {
  it("returns healthy when pipeline is empty", () => {
    expect(derivePipelineHealthInsight({
      activeTotal: 0,
      fixNeededCount: 0,
      humanReviewCount: 0,
      maxBottleneckPercent: 0,
      shippedLast30Days: 0,
      avgCycleDaysLast30: null,
    })).toEqual({
      healthLabel: "healthy",
      insight: "No active features in the pipeline.",
    });
  });

  it("flags stalled when too many features are blocked", () => {
    const result = derivePipelineHealthInsight({
      activeTotal: 10,
      fixNeededCount: 3,
      humanReviewCount: 2,
      maxBottleneckPercent: 30,
      shippedLast30Days: 1,
      avgCycleDaysLast30: 5,
    });
    expect(result.healthLabel).toBe("stalled");
    expect(result.insight).toContain("blocked in fix/review");
  });

  it("flags congested when one stage dominates the pipeline", () => {
    const result = derivePipelineHealthInsight({
      activeTotal: 8,
      fixNeededCount: 1,
      humanReviewCount: 0,
      maxBottleneckPercent: 62,
      topBottleneckLabel: "AI Review",
      topBottleneckCount: 5,
      shippedLast30Days: 2,
      avgCycleDaysLast30: 4,
    });
    expect(result.healthLabel).toBe("congested");
    expect(result.insight).toContain("AI Review");
  });

  it("returns healthy insight with velocity stats", () => {
    const result = derivePipelineHealthInsight({
      activeTotal: 4,
      fixNeededCount: 0,
      humanReviewCount: 1,
      maxBottleneckPercent: 25,
      shippedLast30Days: 3,
      avgCycleDaysLast30: 6.2,
    });
    expect(result.healthLabel).toBe("healthy");
    expect(result.insight).toContain("flowing well");
    expect(result.insight).toContain("3 features shipped");
  });
});
