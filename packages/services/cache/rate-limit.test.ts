import { afterEach, describe, expect, it, vi } from "vitest";

import { checkDistributedRateLimit } from "./rate-limit";
import * as kvStore from "./kv-store";

describe("checkDistributedRateLimit fail-closed", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAllowInMemory = process.env.RATE_LIMIT_ALLOW_IN_MEMORY;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RATE_LIMIT_ALLOW_IN_MEMORY = originalAllowInMemory;
    vi.restoreAllMocks();
  });

  it("denies requests in production when Redis is unavailable", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RATE_LIMIT_ALLOW_IN_MEMORY;

    vi.spyOn(kvStore, "isRedisConfigured").mockReturnValue(true);
    vi.spyOn(kvStore, "cacheIncrDistributed").mockRejectedValue(new Error("Redis down"));

    const result = await checkDistributedRateLimit("test:prod-fail", 10, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to in-memory when not in production", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_ALLOW_IN_MEMORY;

    vi.spyOn(kvStore, "cacheIncr").mockResolvedValue(1);

    const result = await checkDistributedRateLimit("test:dev-ok", 10, 60_000);
    expect(result.allowed).toBe(true);
  });
});
