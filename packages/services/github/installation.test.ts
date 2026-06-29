import crypto from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";

import {
  buildGithubInstallUrl,
  decodeGithubInstallState,
  encodeGithubInstallState,
  verifyGithubWebhookSignature,
} from "./installation";
import { ServiceError } from "../errors";

describe("GitHub install state signing", () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-install-state-secret";
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_SLUG = "shipflow-test";
  });

  it("embeds nonce and verifies HMAC signature", () => {
    const encoded = encodeGithubInstallState({
      organizationId: "org-demo",
      returnTo: "/settings",
    });
    expect(encoded.includes(".")).toBe(true);

    const decoded = decodeGithubInstallState(encoded);
    expect(decoded?.organizationId).toBe("org-demo");
    expect(decoded?.returnTo).toBe("/settings");
    expect(decoded?.nonce).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects tampered install state", () => {
    const encoded = encodeGithubInstallState({ organizationId: "org-demo" });
    const tampered = `${encoded.slice(0, -3)}xxx`;
    expect(decodeGithubInstallState(tampered)).toBeNull();
  });

  it("rejects unsigned legacy base64-only state", () => {
    const legacy = Buffer.from(JSON.stringify({ organizationId: "org-demo" }), "utf8").toString(
      "base64url",
    );
    expect(decodeGithubInstallState(legacy)).toBeNull();
  });

  it("buildGithubInstallUrl includes signed state query param", () => {
    const url = buildGithubInstallUrl({ organizationId: "org-demo", returnTo: "/requests" });
    const state = new URL(url).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(decodeGithubInstallState(state)).toMatchObject({ organizationId: "org-demo" });
  });
});

describe("verifyGithubWebhookSignature (production)", () => {
  const secret = "test-webhook-secret";

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = secret;
  });

  it("accepts valid sha256 signatures", () => {
    const payload = Buffer.from(JSON.stringify({ action: "opened" }));
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(() => verifyGithubWebhookSignature(payload, signature)).not.toThrow();
  });

  it("rejects invalid signatures", () => {
    const payload = Buffer.from("{}");
    expect(() => verifyGithubWebhookSignature(payload, "sha256=deadbeef")).toThrow(ServiceError);
  });
});
