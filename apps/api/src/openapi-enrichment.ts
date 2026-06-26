/**
 * ShipFlow OpenAPI / Scalar enrichment — detailed judge documentation.
 * Applied after trpc-to-openapi generation in server.ts.
 */

import { SHIPFLOW_MCP_TOOLS } from "@repo/services/shipflow-agent-tools";

import { buildShipflowApiDescription } from "./openapi-intro";

type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  requestBody?: { content?: Record<string, { examples?: Record<string, unknown> }> };
  responses?: Record<string, { description?: string }>;
  "x-codeSamples"?: Array<{ lang: string; label: string; source: string }>;
};

export type OpenApiDocumentWithPaths = {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  "x-tagGroups"?: Array<{ name: string; tags: string[] }>;
};

function addReferencePath(
  document: OpenApiDocumentWithPaths,
  path: string,
  method: string,
  operation: OpenApiOperation,
) {
  document.paths = document.paths ?? {};
  document.paths[path] = document.paths[path] ?? {};
  document.paths[path]![method] = operation;
}

function addCodeSample(
  document: OpenApiDocumentWithPaths,
  path: string,
  method: string,
  label: string,
  source: string,
) {
  const op = document.paths?.[path]?.[method];
  if (!op) return;
  op["x-codeSamples"] = [...(op["x-codeSamples"] ?? []), { lang: "shell", label, source }];
}

export function enrichShipflowOpenApi(
  document: OpenApiDocumentWithPaths,
  opts: { clientUrl: string; baseUrl: string },
): OpenApiDocumentWithPaths {
  const { clientUrl, baseUrl } = opts;

  document.info = {
    ...document.info,
    title: "ShipFlow API",
    version: "1.0.0",
    description: buildShipflowApiDescription(clientUrl, baseUrl),
  };

  document.tags = [
    { name: "Health", description: "Liveness and readiness probes" },
    { name: "Feature Requests", description: "Core delivery pipeline — submit, triage, PRD, status" },
    { name: "GitHub", description: "GitHub App connection and repository sync" },
    { name: "Workspace", description: "Organization and project context" },
    { name: "Agent", description: "AI agent status and sessions" },
    { name: "MCP & Streaming", description: "MCP JSON-RPC server and SSE agent stream" },
    { name: "Webhooks", description: "GitHub App webhook receiver" },
  ];

  document["x-tagGroups"] = [
    { name: "Getting started", tags: ["Health"] },
    { name: "ShipFlow core", tags: ["Feature Requests", "Workspace", "GitHub"] },
    { name: "AI platform", tags: ["Agent", "MCP & Streaming"] },
    { name: "Integrations", tags: ["Webhooks"] },
  ];

  document.servers = [
    { url: baseUrl.concat("/api"), description: "REST (trpc-to-openapi)" },
    { url: baseUrl, description: "Raw API (MCP, webhooks, health)" },
  ];

  const mcpToolList = SHIPFLOW_MCP_TOOLS.map((t) => `- \`${t.name}\` — ${t.description}`).join("\n");

  addReferencePath(document, "/ready", "get", {
    summary: "Readiness probe",
    description: "Returns `ready: true` when the API and database are reachable. Used by CI and production orchestrators.",
    tags: ["Health"],
    responses: { "200": { description: "Service ready" }, "503": { description: "Service not ready" } },
  });

  addCodeSample(document, "/ready", "get", "curl", `curl -fsS ${baseUrl}/ready`);

  addReferencePath(document, "/mcp", "post", {
    summary: "MCP JSON-RPC server",
    description: [
      "ShipFlow MCP server — **14 tools** for feature delivery + GitHub workspace.",
      "",
      "**Public methods (no auth):** `initialize`, `tools/list`, `resources/list`, `prompts/list`",
      "",
      "**Protected:** `tools/call` — session cookie or `Authorization: Bearer <SHIPFLOW_MCP_API_KEY>`",
      "",
      "### Tool manifest",
      mcpToolList,
    ].join("\n"),
    tags: ["MCP & Streaming"],
    requestBody: {
      content: {
        "application/json": {
          examples: {
            toolsList: {
              summary: "List all MCP tools",
              value: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
            },
            createFeature: {
              summary: "Create feature request (auth required)",
              value: {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                  name: "create_feature_request",
                  arguments: {
                    title: "Export audit log",
                    rawRequest: "Compliance needs CSV export of all shipped features with approver names.",
                    runTriage: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      "200": { description: "JSON-RPC result" },
      "401": { description: "Authentication required for tools/call" },
      "429": { description: "Rate limited" },
    },
  });

  addCodeSample(
    document,
    "/mcp",
    "post",
    "List tools",
    `curl -s -X POST ${baseUrl}/mcp \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  );

  addReferencePath(document, "/agent/stream", "post", {
    summary: "Agent SSE streaming",
    description:
      "Stream ShipFlow Agent responses via Server-Sent Events. Uses the same 14 tools as MCP. Rate limit: 20/min/user.",
    tags: ["MCP & Streaming"],
    requestBody: {
      content: {
        "application/json": {
          examples: {
            chat: {
              summary: "Start agent chat",
              value: {
                message: "Summarize my pipeline and triage the Slack notification feature request.",
                focusThreadId: "feature:<uuid>",
              },
            },
          },
        },
      },
    },
    responses: { "200": { description: "text/event-stream" }, "429": { description: "Rate limited" } },
  });

  addReferencePath(document, "/webhooks/github", "post", {
    summary: "GitHub App webhook",
    description:
      "Receives GitHub App events. Verified via HMAC-SHA256 (`x-hub-signature-256`) using `GITHUB_WEBHOOK_SECRET`.",
    tags: ["Webhooks"],
    responses: { "200": { description: "Event accepted" }, "401": { description: "Invalid signature" } },
  });

  addCodeSample(
    document,
    "/feature/requests",
    "post",
    "Create feature (cookie auth)",
    `curl -X POST ${baseUrl}/api/feature/requests \\\n  -H "Content-Type: application/json" \\\n  -H "Cookie: <session-cookie>" \\\n  -d '{"title":"OAuth for enterprise","rawRequest":"Need Google SSO with domain allowlist.","runTriage":true}'`,
  );

  return document;
}
