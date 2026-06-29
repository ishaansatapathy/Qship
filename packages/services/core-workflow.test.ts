import { describe, expect, it } from "vitest";

import { ServiceError } from "./errors";
import { guardedUpdateFeatureStatus } from "./feature-request";
import { FEATURE_STATUSES } from "./workflow";
import { RELEASE_REVIEWER_ROLES } from "./workflow-guards";
import { validateGeneratedCodeGate } from "./feature-codegen";

describe("core workflow FSM", () => {
  it("includes the full delivery lifecycle", () => {
    for (const status of [
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
    ]) {
      expect(FEATURE_STATUSES).toContain(status);
    }
  });

  it("rejects illegal status transitions", async () => {
    await expect(guardedUpdateFeatureStatus("missing-id", "submitted", "shipped")).rejects.toThrow(
      ServiceError,
    );
  });
});

describe("workflow guard rules", () => {
  it("defines owner/admin as release reviewer roles", () => {
    expect(RELEASE_REVIEWER_ROLES.has("owner")).toBe(true);
    expect(RELEASE_REVIEWER_ROLES.has("admin")).toBe(true);
    expect(RELEASE_REVIEWER_ROLES.has("member")).toBe(false);
    expect(RELEASE_REVIEWER_ROLES.has("viewer")).toBe(false);
  });
});

describe("codegen gate", () => {
  it("accepts valid TypeScript", () => {
    expect(() =>
      validateGeneratedCodeGate([
        {
          path: "src/feature.ts",
          content: "export const ok = true;\n",
          action: "create",
          summary: "ok",
        },
      ]),
    ).not.toThrow();
  });

  it("rejects invalid TypeScript before commit", () => {
    expect(() =>
      validateGeneratedCodeGate([
        {
          path: "src/broken.ts",
          content: "export const x = \n",
          action: "create",
          summary: "broken",
        },
      ]),
    ).toThrow(ServiceError);
  });
});
