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
  return isProduction();
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
  } catch {
    if (requiresDistributedRateLimit()) {
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
