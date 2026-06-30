import { logger } from "@repo/logger";

import { cacheIncr, cacheIncrDistributed } from "./kv-store";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

function isProduction() {
  const nodeEnv = String(process.env.NODE_ENV ?? "");
  return nodeEnv === "production" || nodeEnv === "prod";
}

function requiresDistributedRateLimit() {
  if (process.env.RATE_LIMIT_ALLOW_IN_MEMORY === "true") return false;
  // Only fail-closed when Redis is actually configured — if REDIS_URL is absent
  // in production we fall back to in-memory rather than denying every request.
  return isProduction() && Boolean(process.env.REDIS_URL?.trim());
}

export async function checkDistributedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  let count: number;
  try {
    count = requiresDistributedRateLimit()
      ? await cacheIncrDistributed(`rl:${key}`, windowMs)
      : await cacheIncr(`rl:${key}`, windowMs);
  } catch (error) {
    if (requiresDistributedRateLimit()) {
      logger.error("rate_limit.redis_unavailable_denying_request", {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        allowed: false,
        remaining: 0,
        limit,
      };
    }
    count = await cacheIncr(`rl:${key}`, windowMs);
  }
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count <= limit,
    remaining,
    limit,
  };
}
