import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { ServiceError } from "@repo/services/errors";

vi.mock("@repo/services/runtime-env", () => ({
  isProductionEnv: vi.fn(() => false),
}));

vi.mock("@repo/services/github", () => ({
  isGithubWebhookConfigured: vi.fn(() => true),
  verifyGithubWebhookSignature: vi.fn(),
  enqueueGithubWebhookRetry: vi.fn(async () => undefined),
  processGithubPullRequestWebhook: vi.fn(async () => ({ handled: true })),
  processGithubInstallationWebhook: vi.fn(async () => ({ handled: true })),
}));

import {
  isGithubWebhookConfigured,
  verifyGithubWebhookSignature,
} from "@repo/services/github";
import { handleGithubWebhook } from "./github-webhook";

function mockReq(body: Buffer, headers: Record<string, string> = {}): Request {
  return {
    body,
    header: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? undefined,
  } as unknown as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

describe("handleGithubWebhook HTTP layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGithubWebhookConfigured).mockReturnValue(true);
  });

  it("returns 401 when HMAC verification fails before JSON parse", async () => {
    vi.mocked(verifyGithubWebhookSignature).mockImplementation(() => {
      throw new ServiceError("UNAUTHORIZED", "Invalid webhook signature");
    });

    const payload = Buffer.from(JSON.stringify({ action: "opened" }));
    const res = mockRes();
    await handleGithubWebhook(
      mockReq(payload, {
        "x-hub-signature-256": "sha256=deadbeef",
        "x-github-event": "pull_request",
        "x-github-delivery": crypto.randomUUID(),
      }),
      res,
    );

    expect(verifyGithubWebhookSignature).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid webhook signature" });
  });

  it("returns 200 and routes pull_request after valid signature", async () => {
    vi.mocked(verifyGithubWebhookSignature).mockImplementation(() => undefined);

    const payload = Buffer.from(JSON.stringify({ action: "opened" }));
    const res = mockRes();
    await handleGithubWebhook(
      mockReq(payload, {
        "x-hub-signature-256": "sha256=valid",
        "x-github-event": "pull_request",
        "x-github-delivery": crypto.randomUUID(),
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, event: "pull_request" });
  });

  it("returns 503 when webhook secret is not configured", async () => {
    vi.mocked(isGithubWebhookConfigured).mockReturnValue(false);

    const res = mockRes();
    await handleGithubWebhook(
      mockReq(Buffer.from("{}"), {
        "x-github-event": "pull_request",
        "x-github-delivery": crypto.randomUUID(),
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(verifyGithubWebhookSignature).not.toHaveBeenCalled();
  });
});
