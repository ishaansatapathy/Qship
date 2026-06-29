import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearGithubWebhookOutboxForTests,
  enqueueGithubWebhookRetry,
  getGithubWebhookOutboxStats,
  processGithubWebhookOutbox,
} from "./webhook-outbox";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
let outboxTableReady = false;

describe("github webhook outbox (Postgres)", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    try {
      await clearGithubWebhookOutboxForTests();
      outboxTableReady = true;
    } catch {
      outboxTableReady = false;
    }
  });

  beforeEach(async (ctx) => {
    if (!outboxTableReady) ctx.skip();
    await clearGithubWebhookOutboxForTests().catch(() => undefined);
  });

  afterEach(async () => {
    if (!outboxTableReady) return;
    await clearGithubWebhookOutboxForTests().catch(() => undefined);
  });

  it("enqueues a retry row with pending status", async () => {
    await enqueueGithubWebhookRetry({
      deliveryId: "outbox-eval-1",
      eventType: "pull_request",
      payload: { action: "opened" },
      error: "simulated handler failure",
    });

    const stats = await getGithubWebhookOutboxStats();
    expect(stats.pending).toBe(1);
  });

  it("dedupes enqueue by delivery id + event type", async () => {
    await enqueueGithubWebhookRetry({
      deliveryId: "outbox-eval-2",
      eventType: "installation",
      payload: { action: "deleted" },
      error: "first",
    });
    await enqueueGithubWebhookRetry({
      deliveryId: "outbox-eval-2",
      eventType: "installation",
      payload: { action: "deleted" },
      error: "second",
    });

    const stats = await getGithubWebhookOutboxStats();
    expect(stats.pending).toBe(1);
  });

  it("processes unsupported events to completed without throwing", async () => {
    await enqueueGithubWebhookRetry({
      deliveryId: "outbox-eval-3",
      eventType: "pull_request",
      payload: { action: "ignored_action_only" },
      error: "retry",
    });

    const processed = await processGithubWebhookOutbox(5);
    expect(processed).toBe(1);

    const stats = await getGithubWebhookOutboxStats();
    expect(stats.completed).toBe(1);
  });
});
