import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearGithubWebhookDeliveriesForTests,
  isGithubDeliveryDuplicate,
} from "./webhook-dedup";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
let dedupTableReady = false;

describe("github webhook delivery dedup (Postgres)", () => {
  beforeAll(async () => {
    if (!hasDatabase) return;
    try {
      await clearGithubWebhookDeliveriesForTests();
      dedupTableReady = true;
    } catch {
      dedupTableReady = false;
    }
  });

  beforeEach(async (ctx) => {
    if (!dedupTableReady) ctx.skip();
    await clearGithubWebhookDeliveriesForTests().catch(() => undefined);
  });

  afterEach(async () => {
    if (!dedupTableReady) return;
    await clearGithubWebhookDeliveriesForTests().catch(() => undefined);
  });

  it("treats first delivery as new", async () => {
    expect(await isGithubDeliveryDuplicate("delivery-eval-1", "pull_request")).toBe(false);
  });

  it("treats duplicate delivery id as already processed", async () => {
    expect(await isGithubDeliveryDuplicate("delivery-eval-2", "pull_request")).toBe(false);
    expect(await isGithubDeliveryDuplicate("delivery-eval-2", "pull_request")).toBe(true);
  });

  it("tracks different event types under same delivery id only once", async () => {
    expect(await isGithubDeliveryDuplicate("delivery-eval-3", "pull_request")).toBe(false);
    expect(await isGithubDeliveryDuplicate("delivery-eval-3", "installation")).toBe(true);
  });
});
