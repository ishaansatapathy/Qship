import type { Request } from "express";
import { eq } from "@repo/database";
import db from "@repo/database";
import { users } from "@repo/database/schema";
import { logger } from "@repo/logger";
import { resolveSessionUser } from "@repo/trpc/server";

/**
 * Resolves the ShipFlow user id for MCP tool calls.
 *
 * Session cookies (web sign-in) always win.
 * Headless access requires SHIPFLOW_MCP_API_KEY bound to SHIPFLOW_MCP_USER_ID.
 */
export async function resolveMcpUserId(req: Request): Promise<string | null> {
  const sessionUser = await resolveSessionUser(req);
  if (sessionUser) {
    req.headers["x-mcp-user-id"] = sessionUser.id;
    return sessionUser.id;
  }

  const apiKey = process.env.SHIPFLOW_MCP_API_KEY?.trim();
  const boundUserId = process.env.SHIPFLOW_MCP_USER_ID?.trim();
  const authHeader = req.header("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!apiKey || !boundUserId || !bearer || bearer !== apiKey) {
    return null;
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, boundUserId))
    .limit(1);

  if (!user) {
    logger.warn("MCP API key auth rejected — bound user not found", { boundUserId });
    return null;
  }

  logger.info("MCP API key auth", { userId: boundUserId, method: req.method, path: req.path });
  req.headers["x-mcp-user-id"] = boundUserId;
  return boundUserId;
}
