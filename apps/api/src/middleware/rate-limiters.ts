import type { Request, Response, NextFunction } from "express";
import { logger } from "@repo/logger";
import { checkDistributedRateLimit } from "@repo/services/cache/rate-limit";

type RateLimitOptions = {
  windowMs: number;
  limit: number;
  keyPrefix: string;
  skip?: (req: Request) => boolean;
};

function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ??
    req.ip ??
    "unknown";
  const userId = req.headers["x-shipflow-user-id"];
  if (typeof userId === "string" && userId.trim()) {
    return `${ip}:${userId.trim()}`;
  }
  return ip;
}

/** Creates an Express rate-limit middleware backed by the distributed cache layer. */
export function createRateLimiter(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.VITEST === "true" || options.skip?.(req)) {
      next();
      return;
    }

    try {
      const key = `${options.keyPrefix}:${clientKey(req)}`;
      const result = await checkDistributedRateLimit(key, options.limit, options.windowMs);

      res.setHeader("X-RateLimit-Limit", String(result.limit));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(Math.ceil(options.windowMs / 1000)));
        const message = "Rate limit exceeded. Please retry shortly.";
        if (req.path === "/trpc" || req.path.startsWith("/trpc/")) {
          res.status(429).json({
            error: {
              json: {
                message,
                code: -32029,
                data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
              },
            },
          });
          return;
        }
        res.status(429).json({
          error: "Too many requests",
          message,
        });
        return;
      }

      next();
    } catch (error) {
      logger.warn("Rate limiter degraded — allowing request", {
        message: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  };
}

/** Paths exempt from global rate limiting (health probes, public API docs). */
export function isGlobalRateLimitExempt(path: string): boolean {
  return (
    path === "/health" ||
    path === "/ready" ||
    path === "/" ||
    path === "/openapi.json" ||
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path === "/trpc" ||
    path.startsWith("/trpc/")
  );
}

/** Global API rate limit — 300 requests / 15 min per IP. */
export const globalRateLimiter = createRateLimiter({
  keyPrefix: "global",
  limit: 300,
  windowMs: 15 * 60 * 1000,
  skip: (req) => isGlobalRateLimitExempt(req.path),
});

/** Auth-sensitive routes — 30 requests / 15 min per IP. */
export const authRateLimiter = createRateLimiter({
  keyPrefix: "auth",
  limit: 30,
  windowMs: 15 * 60 * 1000,
});

/** MCP JSON-RPC — 20 requests / 1 min per IP (agent SSE uses per-user limits in-route). */
export const agentRateLimiter = createRateLimiter({
  keyPrefix: "agent",
  limit: 20,
  windowMs: 60 * 1000,
});
