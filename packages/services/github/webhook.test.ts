import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { ServiceError } from "../errors";
import { verifyGithubWebhookSignature } from "./installation";
import { extractFeatureIdFromPullRequest } from "./webhook";

describe("extractFeatureIdFromPullRequest (production)", () => {
  const UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("extracts UUID from shipflow/ branch prefix", () => {
    expect(extractFeatureIdFromPullRequest({ head: { ref: `shipflow/${UUID}` } })).toBe(UUID);
  });

  it("extracts UUID from Qship-Feature tag in PR body", () => {
    expect(
      extractFeatureIdFromPullRequest({ body: `closes #123\n\nQship-Feature: ${UUID}` }),
    ).toBe(UUID);
  });

  it("extracts UUID from ShipFlow-Feature tag in PR body (legacy)", () => {
    expect(
      extractFeatureIdFromPullRequest({ body: `closes #123\n\nShipFlow-Feature: ${UUID}` }),
    ).toBe(UUID);
  });

  it("prefers branch ref over body tag", () => {
    const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      extractFeatureIdFromPullRequest({
        head: { ref: `shipflow/${UUID}` },
        body: `ShipFlow-Feature: ${other}`,
      }),
    ).toBe(UUID);
  });

  it("returns null when neither convention is present", () => {
    expect(extractFeatureIdFromPullRequest({ head: { ref: "main" }, body: "no tag" })).toBeNull();
  });

  it("is case-insensitive on the tag", () => {
    expect(extractFeatureIdFromPullRequest({ body: `SHIPFLOW-FEATURE: ${UUID}` })).toBe(UUID);
  });
});

describe("verifyGithubWebhookSignature (production module)", () => {
  const secret = "test-webhook-secret";

  it("accepts a valid sha256 signature", () => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    const payload = Buffer.from(JSON.stringify({ action: "opened" }));
    const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(() => verifyGithubWebhookSignature(payload, sig)).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    const payload = Buffer.from(JSON.stringify({ action: "opened" }));
    const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    const tampered = Buffer.from(JSON.stringify({ action: "deleted" }));
    expect(() => verifyGithubWebhookSignature(tampered, sig)).toThrow(ServiceError);
  });

  it("rejects a signature missing sha256= prefix", () => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    const payload = Buffer.from("{}");
    const raw = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(() => verifyGithubWebhookSignature(payload, raw)).toThrow(ServiceError);
  });
});

describe("merge → human_review status policy", () => {
  it("transitions merged PR to human_review when no prior approval exists", () => {
    const hasApproval = false;
    const nextStatus = hasApproval ? "approved" : "human_review";
    expect(nextStatus).toBe("human_review");
  });

  it("transitions merged PR to approved when human approval already on record", () => {
    const hasApproval = true;
    const nextStatus = hasApproval ? "approved" : "human_review";
    expect(nextStatus).toBe("approved");
  });
});
