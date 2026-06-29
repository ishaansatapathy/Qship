import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { getAppOctokit } from "./client";
import {
  decodeGithubInstallState,
  encodeGithubInstallState,
  verifyGithubWebhookSignature,
} from "./installation";
import { isGithubAppConfigured, isGithubWebhookConfigured } from "./config";

const liveSmokeEnabled =
  process.env.GITHUB_LIVE_SMOKE === "1" && isGithubAppConfigured() && isGithubWebhookConfigured();

describe("github live smoke (optional CI)", () => {
  it.skipIf(!liveSmokeEnabled)("GitHub App JWT authenticates with api.github.com", async () => {
    const app = getAppOctokit();
    const { data } = await app.rest.apps.getAuthenticated();
    expect(data).toBeTruthy();
    expect(data!.id).toBeTruthy();
    expect(data!.slug ?? data!.name).toBeTruthy();
  });

  it.skipIf(!liveSmokeEnabled)("can list App installations (may be empty)", async () => {
    const app = getAppOctokit();
    const installations = await app.paginate(app.rest.apps.listInstallations, { per_page: 5 });
    expect(Array.isArray(installations)).toBe(true);
  });

  it.skipIf(!liveSmokeEnabled)("install state round-trips with production webhook secret", () => {
    const encoded = encodeGithubInstallState({
      organizationId: "org-live-smoke",
      returnTo: "/settings",
    });
    const decoded = decodeGithubInstallState(encoded);
    expect(decoded?.organizationId).toBe("org-live-smoke");
    expect(decoded?.nonce).toBeTruthy();
  });

  it.skipIf(!liveSmokeEnabled)("webhook HMAC verify accepts signed payload", () => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET!;
    const payload = Buffer.from(JSON.stringify({ action: "opened", zen: "live-smoke" }));
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(() => verifyGithubWebhookSignature(payload, signature)).not.toThrow();
  });
});

describe("github live smoke gate", () => {
  it("documents when live smoke runs", () => {
    if (liveSmokeEnabled) {
      expect(isGithubAppConfigured()).toBe(true);
      expect(isGithubWebhookConfigured()).toBe(true);
    } else {
      expect(process.env.GITHUB_LIVE_SMOKE === "1").toBe(false);
    }
  });
});
