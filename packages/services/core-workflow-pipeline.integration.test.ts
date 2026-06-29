import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServiceError } from "./errors";
import { validateGeneratedCodeGate } from "./feature-codegen";
import { isFeatureTransitionAllowed } from "./feature-request";
import type { FeatureReleaseResult } from "./github/release-ship";
import { assertReleaseReadyForShip } from "./release-validation";
import type { FeatureStatus } from "./workflow";

/** Canonical happy-path from employee request to production ship. */
const DELIVERY_HAPPY_PATH: FeatureStatus[] = [
  "submitted",
  "prd_generating",
  "prd_ready",
  "planning",
  "in_development",
  "pr_open",
  "ai_review",
  "human_review",
  "approved",
  "shipped",
];

function successfulRelease(): FeatureReleaseResult {
  return {
    merge: { attempted: true, merged: true, prNumber: 42, prUrl: "https://github.com/org/repo/pull/42" },
    deploy: { attempted: true, triggered: true, simulated: false },
  };
}

describe("core delivery pipeline (integration)", () => {
  it("allows every transition in the happy-path delivery sequence", () => {
    for (let i = 0; i < DELIVERY_HAPPY_PATH.length - 1; i++) {
      const from = DELIVERY_HAPPY_PATH[i]!;
      const to = DELIVERY_HAPPY_PATH[i + 1]!;
      expect(isFeatureTransitionAllowed(from, to)).toBe(true);
    }
  });

  it("blocks shortcut jumps that bypass review and approval gates", () => {
    expect(isFeatureTransitionAllowed("submitted", "shipped")).toBe(false);
    expect(isFeatureTransitionAllowed("submitted", "approved")).toBe(false);
    expect(isFeatureTransitionAllowed("prd_ready", "human_review")).toBe(false);
    expect(isFeatureTransitionAllowed("pr_open", "shipped")).toBe(false);
    expect(isFeatureTransitionAllowed("approved", "human_review")).toBe(false);
  });

  describe("production ship gate (merge + deploy webhook)", () => {
    const original = { ...process.env };

    beforeEach(() => {
      process.env = {
        ...original,
        NODE_ENV: "production",
        SHIP_DEPLOY_WEBHOOK_URL: "https://api.vercel.com/v1/integrations/deploy/test/test",
      };
    });

    afterEach(() => {
      process.env = original;
    });

    it("accepts ship when PR merged and deploy webhook succeeded", () => {
      expect(() =>
        assertReleaseReadyForShip(successfulRelease(), {
          hadOpenPr: true,
          hadGithubConnection: true,
        }),
      ).not.toThrow();
    });

    it("rejects ship when deploy webhook failed after merge", () => {
      const release = successfulRelease();
      release.deploy = { attempted: true, triggered: false, simulated: false, reason: "HTTP 500" };

      expect(() =>
        assertReleaseReadyForShip(release, { hadOpenPr: true, hadGithubConnection: true }),
      ).toThrow(/Deploy webhook failed/);
    });

    it("rejects ship when merge failed despite open PR", () => {
      const release = successfulRelease();
      release.merge = { attempted: true, merged: false, reason: "merge_conflict" };
      release.deploy = { attempted: false, triggered: false, simulated: true };

      expect(() =>
        assertReleaseReadyForShip(release, { hadOpenPr: true, hadGithubConnection: true }),
      ).toThrow(/merge failed/i);
    });
  });

  describe("codegen gate before GitHub commit", () => {
    it("accepts valid multi-file TypeScript in one program", () => {
      expect(() =>
        validateGeneratedCodeGate([
          {
            path: "src/feature/util.ts",
            content: "export function add(a: number, b: number): number { return a + b; }\n",
            action: "create",
            summary: "util",
          },
          {
            path: "src/feature/index.ts",
            content: "export const total: number = 3;\n",
            action: "create",
            summary: "entry",
          },
        ]),
      ).not.toThrow();
    });

    it("rejects type errors that syntax-only parsing would miss", () => {
      expect(() =>
        validateGeneratedCodeGate([
          {
            path: "src/bad-types.ts",
            content: 'export const broken: number = "not-a-number";\n',
            action: "create",
            summary: "bad",
          },
        ]),
      ).toThrow(ServiceError);
    });

    it("rejects syntax errors before type-checking proceeds", () => {
      expect(() =>
        validateGeneratedCodeGate([
          {
            path: "src/syntax-error.ts",
            content: "export const x = \n",
            action: "create",
            summary: "broken syntax",
          },
        ]),
      ).toThrow(ServiceError);
    });
  });
});
