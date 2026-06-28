import { describe, expect, it } from "vitest";

import {
  buildReviewHealthSummary,
  computeReviewHealthScore,
  computeSlaStatus,
  reviewHealthLabel,
} from "./review-health";

describe("computeReviewHealthScore", () => {
  it("returns 100 for a perfect review loop", () => {
    expect(
      computeReviewHealthScore({
        passRate: 100,
        iterationCount: 1,
        slaStatus: "ok",
        allBlockingResolved: true,
        latestPass: true,
      }),
    ).toBe(100);
  });

  it("penalises low pass rate heavily", () => {
    expect(
      computeReviewHealthScore({
        passRate: 40,
        iterationCount: 1,
        slaStatus: "ok",
        allBlockingResolved: true,
        latestPass: true,
      }),
    ).toBe(70);
  });

  it("penalises SLA breach and failed latest review", () => {
    const score = computeReviewHealthScore({
      passRate: 100,
      iterationCount: 6,
      slaStatus: "breach",
      allBlockingResolved: false,
      latestPass: false,
    });
    expect(score).toBeLessThanOrEqual(35);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("never returns below 0 or above 100", () => {
    const score = computeReviewHealthScore({
      passRate: 0,
      iterationCount: 10,
      slaStatus: "breach",
      allBlockingResolved: false,
      latestPass: false,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("reviewHealthLabel", () => {
  it("maps score bands to labels", () => {
    expect(reviewHealthLabel(90)).toBe("healthy");
    expect(reviewHealthLabel(65)).toBe("needs_attention");
    expect(reviewHealthLabel(30)).toBe("critical");
  });
});

describe("computeSlaStatus", () => {
  it("returns ok when not waiting", () => {
    expect(computeSlaStatus(null)).toBe("ok");
  });

  it("returns at_risk after 24 hours", () => {
    expect(computeSlaStatus(25 * 60 * 60 * 1000)).toBe("at_risk");
  });

  it("returns breach after 48 hours", () => {
    expect(computeSlaStatus(50 * 60 * 60 * 1000)).toBe("breach");
  });
});

describe("buildReviewHealthSummary", () => {
  it("returns early message when no reviews exist", () => {
    expect(
      buildReviewHealthSummary({
        score: 0,
        iterationCount: 0,
        latestPass: false,
        averageIssuesPerIteration: 0,
        slaStatus: "ok",
        waitingInHumanReviewHours: null,
      }),
    ).toBe("No AI review has been run yet.");
  });

  it("includes SLA breach warning in summary", () => {
    const summary = buildReviewHealthSummary({
      score: 55,
      iterationCount: 2,
      latestPass: true,
      averageIssuesPerIteration: 1,
      slaStatus: "breach",
      waitingInHumanReviewHours: 52,
    });
    expect(summary).toContain("SLA breach");
    expect(summary).toContain("52");
  });
});
