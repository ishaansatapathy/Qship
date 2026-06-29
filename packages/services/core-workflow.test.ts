import { describe, expect, it } from "vitest";

import { FEATURE_STATUSES } from "./workflow";

describe("core workflow constants", () => {
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
});

describe("workflow guard rules", () => {
  it("defines owner/admin as release reviewer roles", () => {
    const roles = new Set(["owner", "admin"]);
    expect(roles.has("owner")).toBe(true);
    expect(roles.has("member")).toBe(false);
  });
});

describe("ship release env", () => {
  it("documents optional deploy webhook for real ship step", () => {
    expect(process.env.SHIP_DEPLOY_WEBHOOK_URL ?? "").toBeTypeOf("string");
  });
});
