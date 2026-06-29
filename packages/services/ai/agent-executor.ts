/**
 * Shared tool-executor factory for the ShipFlow Agent.
 * Delegates exclusively to ShipFlow MCP tools (37 tools — CI parity verified).
 */

import type { ApprovalDefaults } from "../settings";
import { ServiceError } from "../errors";
import { executeShipflowTool, isShipflowTool } from "../shipflow-agent-tools";
import { checkAgentToolConfirmation } from "./agent-tool-confirm";
import { detectToolArgInjection } from "./agent-guard";
import type { AgentActionCard } from "./agent";

export type AgentExecutorContext = {
  tenantId: string;
  actions: AgentActionCard[];
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
};

export function buildToolExecutor(ctx: AgentExecutorContext) {
  const { tenantId, actions, userMessage, approvalDefaults } = ctx;

  return async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (!isShipflowTool(name)) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }

    const argInjection = detectToolArgInjection(args);
    if (argInjection.flagged) {
      return JSON.stringify({
        error: argInjection.reason,
        blocked: true,
      });
    }

    const confirmation = checkAgentToolConfirmation({
      toolName: name,
      userMessage,
      approvalDefaults,
    });
    if (!confirmation.allowed) {
      return JSON.stringify({
        error: confirmation.reason,
        confirmationRequired: true,
        tool: name,
      });
    }

    try {
      return await executeShipflowTool({ userId: tenantId, actions }, name, args);
    } catch (error) {
      const message = error instanceof ServiceError ? error.message : "Tool failed";
      return JSON.stringify({ error: message });
    }
  };
}
