import type { Request, Response, NextFunction } from "express";
import { logger } from "@repo/logger";
import { checkDistributedRateLimit } from "@repo/services/cache/rate-limit";

function isProduction() {
  const nodeEnv = String(process.env.NODE_ENV ?? "");
  return nodeEnv === "production" || nodeEnv === "prod";
}

function requiresDistributedRateLimit() {
  if (process.env.RATE_LIMIT_ALLOW_IN_MEMORY === "true") return false;
  return isProduction() && Boolean(process.env.REDIS_URL?.trim());
}

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
        // req.path is relative to the mount point (e.g. "/github.connectionStatus"
        // when mounted at "/trpc"), so use originalUrl for tRPC detection.
        const originalPath = (req.originalUrl ?? "").split("?")[0] ?? "";
        if (originalPath === "/trpc" || originalPath.startsWith("/trpc/")) {
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
      if (requiresDistributedRateLimit()) {
        logger.error("Rate limiter unavailable — denying request", {
          message: error instanceof Error ? error.message : String(error),
        });
        const originalPath = (req.originalUrl ?? "").split("?")[0] ?? "";
        const isTrpc = originalPath === "/trpc" || originalPath.startsWith("/trpc/");
        if (isTrpc) {
          res.status(503).json({
            error: {
              json: {
                message: "Rate limiting backend is unavailable. Please retry shortly.",
                code: -32004,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 503 },
              },
            },
          });
        } else {
          res.status(503).json({
            error: "Service temporarily unavailable",
            message: "Rate limiting backend is unavailable. Please retry shortly.",
          });
        }
        return;
      }
      logger.warn("Rate limiter degraded — allowing request", {
        message: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  };
}

/** Paths exempt from global rate limiting (health probes, public API docs, authenticated transports). */
export function isGlobalRateLimitExempt(path: string): boolean {
  return (
    path === "/health" ||
    path === "/ready" ||
    path === "/" ||
    path === "/openapi.json" ||
    path === "/docs" ||
    path.startsWith("/docs/") ||
    path === "/trpc" ||
    path.startsWith("/trpc/") ||
    path === "/agent/stream"
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

/**
 * tRPC transport — 150 requests / 5 min per IP.
 *
 * The global limiter (300/15 min) explicitly exempts /trpc to avoid double-
 * counting every page render. This dedicated limiter closes the security gap by
 * still capping the native tRPC transport separately, preventing brute-force
 * mutation abuse (agent.chat, feature.create, billing.*, etc.) without blocking
 * normal dashboard usage (~10–20 queries per page load).
 */
export const trpcRateLimiter = createRateLimiter({
  keyPrefix: "trpc",
  limit: 150,
  windowMs: 5 * 60 * 1000,
});

/** MCP JSON-RPC — 20 requests / 1 min per IP (agent SSE uses per-user limits in-route). */
export const agentRateLimiter = createRateLimiter({
  keyPrefix: "agent",
  limit: 20,
  windowMs: 60 * 1000,
});
