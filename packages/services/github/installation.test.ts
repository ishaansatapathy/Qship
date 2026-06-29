import crypto from "node:crypto";
import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  buildGithubInstallUrl,
  completeGithubInstallation,
  decodeGithubInstallState,
  encodeGithubInstallState,
  verifyGithubWebhookSignature,
} from "./installation";
import { ServiceError } from "../errors";

vi.mock("../organization", () => ({
  getMembershipForUser: vi.fn(async () => ({
    organizationId: "org-demo",
    organization: { id: "org-demo", githubInstallationId: null, githubAccountLogin: null },
    role: "owner",
  })),
}));

vi.mock("./client", () => ({
  getInstallationOctokit: vi.fn(() => ({
    rest: {
      apps: {
        getInstallation: vi.fn(async () => ({
          data: { account: { login: "acme" } },
        })),
      },
    },
    paginate: vi.fn(async () => []),
  })),
}));

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  return {
    ...actual,
    default: {
      query: {
        repositories: { findMany: vi.fn(async () => []) },
      },
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => ({})) })) })),
      insert: vi.fn(() => ({ onConflictDoUpdate: vi.fn(async () => ({})) })),
      delete: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
    },
  };
});

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

  it("requires webhook secret for install state signing in production", () => {
    const prevNode = process.env.NODE_ENV;
    const prevSecret = process.env.GITHUB_WEBHOOK_SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expect(() => encodeGithubInstallState({ organizationId: "org-demo" })).toThrow(ServiceError);
    process.env.NODE_ENV = prevNode;
    process.env.GITHUB_WEBHOOK_SECRET = prevSecret;
  });
});

describe("completeGithubInstallation", () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = "test-install-state-secret";
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_SLUG = "shipflow-test";
  });

  it("rejects callback without valid signed state", async () => {
    await expect(
      completeGithubInstallation({
        userId: "user-1",
        installationId: "999",
        state: null,
      }),
    ).rejects.toThrow(/Invalid or expired GitHub install state/);
  });

  it("completes install when signed state matches workspace", async () => {
    const state = encodeGithubInstallState({ organizationId: "org-demo", returnTo: "/settings" });
    const result = await completeGithubInstallation({
      userId: "user-1",
      installationId: "999",
      state,
    });
    expect(result.installationId).toBe("999");
    expect(result.returnTo).toBe("/settings");
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
