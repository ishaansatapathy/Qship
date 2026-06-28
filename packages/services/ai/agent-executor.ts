/**
 * Shared tool-executor factory for the ShipFlow Agent.
 * Delegates exclusively to ShipFlow MCP tools (35 tools — CI parity verified).
 */

import { ServiceError } from "../errors";
import { executeShipflowTool, isShipflowTool } from "../shipflow-agent-tools";
import type { AgentActionCard } from "./agent";

export type AgentExecutorContext = {
  tenantId: string;
  actions: AgentActionCard[];
};

export function buildToolExecutor(ctx: AgentExecutorContext) {
  const { tenantId, actions } = ctx;

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (!isShipflowTool(name)) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    try {
      return await executeShipflowTool({ userId: tenantId, actions }, name, args);
    } catch (error) {
      const message = error instanceof ServiceError ? error.message : "Tool failed";
      return JSON.stringify({ error: message });
    }
  };
}
