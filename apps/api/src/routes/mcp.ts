/**
 * ShipFlow MCP Server — feature delivery + GitHub tools over JSON-RPC 2.0 / MCP 2024-11.
 * Endpoint: POST /mcp
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "@repo/logger";
import { ServiceError } from "@repo/services/errors";
import {
  SHIPFLOW_MCP_TOOLS,
  executeShipflowTool,
  isShipflowTool,
} from "@repo/services/shipflow-agent-tools";
import { checkDistributedRateLimit } from "@repo/services/cache/rate-limit";

import { resolveMcpUserId } from "../mcp-auth";

const MCP_SERVER_VERSION = "1.0.0";
const skipInTests = () => process.env.VITEST === "true";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

function ok(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data ? { data } : {}) } };
}

async function applyMcpIpRateLimit(req: Request, res: Response): Promise<boolean> {
  if (skipInTests()) return true;
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const result = await checkDistributedRateLimit(`mcp:ip:${ip}`, 120, 60_000);
  res.setHeader("RateLimit-Limit", "120");
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    res.status(429).json(rpcError(null, -32000, "Too many requests. Please slow down."));
    return false;
  }
  return true;
}

async function applyMcpUserRateLimit(req: Request, res: Response, userId: string): Promise<boolean> {
  if (skipInTests()) return true;
  const result = await checkDistributedRateLimit(`mcp:user:${userId}`, 60, 60_000);
  res.setHeader("RateLimit-Limit", "60");
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    res.status(429).json(rpcError(null, -32000, "Too many requests. Please slow down."));
    return false;
  }
  return true;
}

function mcpTextContent(payload: unknown) {
  return [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }];
}

export const mcpRouter = Router();

mcpRouter.get("/", (_req: Request, res: Response) => {
  return res.json({
    name: "shipflow-mcp",
    version: MCP_SERVER_VERSION,
    description: "Qship MCP — feature delivery pipeline + GitHub workspace tools",
    protocol: "MCP 2024-11 / JSON-RPC 2.0",
    endpoint: "/mcp",
    tools: SHIPFLOW_MCP_TOOLS.map((t) => t.name),
  });
});

mcpRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as JsonRpcRequest;

  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return res.status(400).json(rpcError(body?.id ?? null, -32600, "Invalid JSON-RPC request"));
  }

  const id = body.id ?? null;
  const method = body.method;
  const publicMethods = new Set(["initialize", "notifications/initialized"]);

  if (publicMethods.has(method)) {
    const ipLimitOk = await applyMcpIpRateLimit(req, res);
    if (!ipLimitOk) return;
  }

  const sensitiveListMethods = new Set(["tools/list", "resources/list", "prompts/list"]);
  if (sensitiveListMethods.has(method)) {
    const userId = await resolveMcpUserId(req);
    if (!userId) {
      return res.status(401).json(rpcError(id, -32001, "Authentication required"));
    }
    const userLimitOk = await applyMcpUserRateLimit(req, res, userId);
    if (!userLimitOk) return;
  }

  try {
    if (method === "initialize") {
      return res.json(
        ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: "shipflow-mcp", version: MCP_SERVER_VERSION },
        }),
      );
    }

    if (method === "tools/list") {
      return res.json(ok(id, { tools: SHIPFLOW_MCP_TOOLS }));
    }

    if (method === "resources/list") {
      return res.json(
        ok(id, {
          resources: [
            {
              uri: "shipflow://requests",
              name: "Feature Requests",
              description: "Employee feature request pipeline. Use list_feature_requests or get_pipeline_summary.",
              mimeType: "application/json",
            },
            {
              uri: "shipflow://github",
              name: "GitHub Repositories",
              description: "Linked repos after GitHub App install. Use list_github_repositories.",
              mimeType: "application/json",
            },
          ],
        }),
      );
    }

    if (method === "prompts/list") {
      return res.json(
        ok(id, {
          prompts: [
            {
              name: "pipeline_brief",
              description: "Summarize the current feature delivery pipeline",
              arguments: [],
            },
            {
              name: "submit_feature",
              description: "Draft and submit a new feature request",
              arguments: [
                { name: "title", description: "Feature title", required: true },
                { name: "description", description: "Full request text", required: true },
              ],
            },
          ],
        }),
      );
    }

    if (method === "notifications/initialized") {
      return res.status(204).end();
    }

    if (method === "tools/call") {
      const userId = await resolveMcpUserId(req);
      if (!userId) {
        return res.status(401).json(rpcError(id, -32001, "Authentication required"));
      }

      const userLimitOk = await applyMcpUserRateLimit(req, res, userId);
      if (!userLimitOk) return;

      const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const toolName = params?.name ?? "";
      const toolArgs = params?.arguments ?? {};

      if (!isShipflowTool(toolName)) {
        return res.status(400).json(rpcError(id, -32601, `Unknown tool: ${toolName}`));
      }

      const actions: import("@repo/services/ai/agent").AgentActionCard[] = [];
      const raw = await executeShipflowTool({ userId, actions }, toolName, toolArgs);
      const parsed = JSON.parse(raw) as unknown;

      if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
        return res.json(
          ok(id, {
            content: mcpTextContent(parsed),
            isError: true,
          }),
        );
      }

      logger.info("mcp.tool.call", { userId, tool: toolName });
      return res.json(ok(id, { content: mcpTextContent(parsed) }));
    }

    return res.status(400).json(rpcError(id, -32601, `Method not found: ${method}`));
  } catch (error) {
    const message =
      error instanceof ServiceError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Internal error";
    logger.warn("mcp.error", { method, message });
    return res.status(500).json(rpcError(id, -32603, message));
  }
});
