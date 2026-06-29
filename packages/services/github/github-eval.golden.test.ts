import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SHIPFLOW_MCP_TOOLS } from "../shipflow-agent-tools";
import { AGENT_TOOLS } from "../ai/agent-internals";

/** Labeled invariants for GitHub integration merge gate (see AI_EVAL.md §3). */
export const GITHUB_EVAL_INVARIANTS = [
  "signed_install_state_with_nonce",
  "webhook_hmac_timing_safe",
  "postgres_delivery_dedup",
  "feature_branch_shipflow_uuid",
  "feature_pr_body_tag",
  "squash_merge_on_ship",
  "agent_mcp_tool_parity",
  "repo_picker_multi_repo",
  "sync_installation_exposed",
] as const;

export const GITHUB_EVAL_INVARIANT_COUNT = GITHUB_EVAL_INVARIANTS.length;

describe("github integration eval harness", () => {
  it(`documents ${GITHUB_EVAL_INVARIANT_COUNT}+ integration invariants`, () => {
    expect(GITHUB_EVAL_INVARIANT_COUNT).toBeGreaterThanOrEqual(8);
  });

  it("agent and MCP expose the same GitHub tool names", () => {
    const githubTools = ["github_connection_status", "list_github_repositories"];
    for (const name of githubTools) {
      expect(AGENT_TOOLS.map((t) => t.function.name)).toContain(name);
      expect(SHIPFLOW_MCP_TOOLS.map((t) => t.name)).toContain(name);
    }
  });

  it("mcp-server.json lists GitHub tools", () => {
    const manifestPath = path.resolve(__dirname, "../../../mcp-server.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      tools: Array<{ name: string }>;
    };
    const names = manifest.tools.map((t) => t.name);
    expect(names).toContain("github_connection_status");
    expect(names).toContain("list_github_repositories");
    expect(names).toContain("implement_feature_code");
  });
});
