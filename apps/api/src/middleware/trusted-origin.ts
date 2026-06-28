import type { Request, Response, NextFunction } from "express";
import { logger } from "@repo/logger";
import {
  buildTrustedOrigins,
  validateMutatingRequest,
} from "@repo/services/security/trusted-origin";

import { env } from "../env";

const trustedOrigins = buildTrustedOrigins({
  clientUrl: env.CLIENT_URL,
  baseUrl: env.BASE_URL,
  betterAuthUrl: process.env.BETTER_AUTH_URL,
});

/**
 * Validates trusted origins and CSRF token for state-changing requests.
 * Webhooks and bearer-authenticated MCP clients are exempt.
 */
export function trustedOriginMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.VITEST === "true") {
    next();
    return;
  }

  const result = validateMutatingRequest({
    method: req.method,
    path: req.path,
    origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
    referer: typeof req.headers.referer === "string" ? req.headers.referer : undefined,
    csrfHeader: typeof req.headers["x-app-csrf"] === "string" ? req.headers["x-app-csrf"] : undefined,
    authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
    trustedOrigins,
  });

  if (!result.ok) {
    logger.warn("Blocked cross-origin mutating request", {
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      reason: result.reason,
    });
    res.status(403).json({ error: "Forbidden", message: result.reason });
    return;
  }

  next();
}
