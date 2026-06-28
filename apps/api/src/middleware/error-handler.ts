import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { logger } from "@repo/logger";

/** Attaches a stable request ID to every request for log correlation. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    (typeof incoming === "string" && incoming.trim()) || crypto.randomUUID().slice(0, 12);
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

/** Global Express error handler — never leaks stack traces to clients. */
export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error("Unhandled Express error", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (res.headersSent) return;

  res.status(500).json({
    error: "Internal Server Error",
    message: "Something went wrong. Please try again.",
  });
}

/** 404 handler for unknown routes. */
export function notFoundMiddleware(_req: Request, res: Response) {
  res.status(404).json({ error: "Not Found", message: "Route not found." });
}
