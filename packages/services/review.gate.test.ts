import { describe, expect, it } from "vitest";

import { evaluateHumanApprovalEligibility } from "./review";
import type { FeatureStatus } from "./workflow";

const passingReview = {
  readyForHuman: true,
  issues: [] as Array<{ severity: string; resolved: boolean }>,
  rawAnalysis: { pass: true },
};

describe("evaluateHumanApprovalEligibility", () => {
  it("allows approve when status is human_review and AI review passed", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: passingReview,
      isProduction: true,
    });
    expect(result).toEqual({ eligible: true, status: "human_review", blockingCount: 0 });
  });

  it("blocks when status is not human_review", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "fix_needed" as FeatureStatus,
      latestReview: passingReview,
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("fix_needed");
  });

  it("blocks when no AI review exists", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: null,
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("no AI review");
  });

  it("blocks when latest review failed readyForHuman", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: false,
        issues: [{ severity: "blocking", resolved: false }],
        rawAnalysis: {},
      },
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingCount).toBe(1);
  });

  it("blocks when blocking issues are marked unresolved", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: true,
        issues: [{ severity: "blocking", resolved: false }],
        rawAnalysis: {},
      },
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingCount).toBe(1);
  });

  it("blocks demoOnly reviews in production", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: true,
        issues: [],
        rawAnalysis: { demoOnly: true },
      },
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("demo only");
  });

  it("allows demoOnly reviews outside production", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: true,
        issues: [],
        rawAnalysis: { demoOnly: true },
      },
      isProduction: false,
    });
    expect(result.eligible).toBe(true);
  });
});
