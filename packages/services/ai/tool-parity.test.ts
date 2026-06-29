import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOLS } from "./agent-internals";
import { SHIPFLOW_MCP_TOOLS } from "../shipflow-agent-tools";

describe("agent ↔ MCP tool parity", () => {
  it("agent exposes every ShipFlow MCP tool", () => {
    const mcpNames = SHIPFLOW_MCP_TOOLS.map((t) => t.name).sort();
    const agentNames = AGENT_TOOLS.map((tool) => tool.function.name).sort();

    expect(agentNames).toEqual(mcpNames);
    expect(agentNames.length).toBe(SHIPFLOW_MCP_TOOLS.length);
  });

  it("mcp-server.json matches runtime tool registry", () => {
    const manifestPath = path.resolve(__dirname, "../../../mcp-server.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      tools: Array<{ name: string }>;
    };
    const manifestNames = manifest.tools.map((t) => t.name).sort();
    const runtimeNames = SHIPFLOW_MCP_TOOLS.map((t) => t.name).sort();
    expect(manifestNames).toEqual(runtimeNames);
  });

  it("agent tools are ShipFlow-only (no legacy Gmail/calendar tools)", () => {
    const legacy = ["list_inbox", "queue_email", "queue_calendar_invite", "search_inbox"];
    const agentNames = AGENT_TOOLS.map((tool) => tool.function.name);
    for (const name of legacy) {
      expect(agentNames).not.toContain(name);
    }
  });
});
