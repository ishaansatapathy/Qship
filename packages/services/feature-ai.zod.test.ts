import { describe, expect, it } from "vitest";

import { ServiceError } from "./errors";
import {
  ApprovalBriefingSchema,
  FeatureAiReviewSchema,
  FeatureTriageSchema,
  PrAiReviewResultSchema,
  parseValidatedAiJson,
} from "./feature-ai";

describe("feature-ai Zod validation", () => {
  it("parses valid feature triage JSON", () => {
    const result = parseValidatedAiJson(
      JSON.stringify({
        priority: "P1",
        impactSummary: "High user impact",
        category: "Security",
        estimatedEffort: "M",
        riskLevel: "high",
        riskFactors: ["auth bypass"],
        clarifyingQuestions: ["Which tenants?"],
        recommendation: "Ship behind flag",
        stakeholderImpact: "Enterprise customers",
        breakingChangeRisk: false,
      }),
      FeatureTriageSchema,
    );
    expect(result.priority).toBe("P1");
    expect(result.riskFactors).toEqual(["auth bypass"]);
  });

  it("rejects triage with invalid priority enum", () => {
    expect(() =>
      parseValidatedAiJson(
        JSON.stringify({
          priority: "P9",
          impactSummary: "x",
          category: "x",
          estimatedEffort: "M",
          riskLevel: "low",
          recommendation: "x",
          stakeholderImpact: "x",
          breakingChangeRisk: false,
        }),
        FeatureTriageSchema,
      ),
    ).toThrow(ServiceError);
  });

  it("parses valid AI review JSON with defaults for missing arrays", () => {
    const result = parseValidatedAiJson(
      JSON.stringify({
        summary: "Looks good",
        recommendation: "Approve",
        pass: true,
        severity: "low",
      }),
      FeatureAiReviewSchema,
    );
    expect(result.findings).toEqual([]);
    expect(result.checklistResults).toEqual([]);
  });

  it("parses approval briefing with 0-1 confidence scale", () => {
    const result = parseValidatedAiJson(
      JSON.stringify({
        summary: "Ready to ship",
        keyThingsToVerify: ["OAuth scopes"],
        remainingConcerns: [],
        approvalRecommendation: "approve",
        confidence: 0.92,
        riskLevel: "low",
        rationale: "All blocking issues resolved",
      }),
      ApprovalBriefingSchema,
    );
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it("rejects approval briefing when confidence is on 0-100 scale", () => {
    expect(() =>
      parseValidatedAiJson(
        JSON.stringify({
          summary: "Ready",
          approvalRecommendation: "approve",
          confidence: 92,
          riskLevel: "low",
          rationale: "ok",
        }),
        ApprovalBriefingSchema,
      ),
    ).toThrow(ServiceError);
  });

  it("parses PR AI review with issues array", () => {
    const result = parseValidatedAiJson(
      JSON.stringify({
        summary: "Two blocking issues",
        pass: false,
        findings: ["Missing rate limit"],
        recommendation: "Fix auth middleware",
        severity: "high",
        issues: [
          {
            severity: "blocking",
            category: "Security",
            title: "No rate limit",
            description: "Add limiter on /login",
            filePath: "apps/api/src/server.ts",
          },
        ],
      }),
      PrAiReviewResultSchema,
    );
    expect(result.issues).toHaveLength(1);
    expect(result.pass).toBe(false);
  });
});
