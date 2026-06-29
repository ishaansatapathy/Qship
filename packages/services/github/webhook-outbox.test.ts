import { describe, expect, it } from "vitest";

import { computeNextRetryDelayMs } from "./webhook-outbox-utils";

describe("webhook outbox retry backoff", () => {
  it("exponential backoff caps at 15 minutes", () => {
    expect(computeNextRetryDelayMs(1)).toBe(30_000);
    expect(computeNextRetryDelayMs(5)).toBeLessThanOrEqual(15 * 60_000);
    expect(computeNextRetryDelayMs(20)).toBe(15 * 60_000);
  });
});
