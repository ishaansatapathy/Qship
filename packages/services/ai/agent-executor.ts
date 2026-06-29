/**
 * Shared tool-executor factory for the ShipFlow Agent.
 * Delegates exclusively to ShipFlow MCP tools (37 tools — CI parity verified).
 */

import type { ApprovalDefaults } from "../settings";
import { ServiceError } from "../errors";
import { executeShipflowTool, isShipflowTool } from "../shipflow-agent-tools";
import { checkAgentToolConfirmation } from "./agent-tool-confirm";
import { detectToolArgInjection } from "./agent-guard";
import type { AgentPendingConfirmation } from "./agent-pending-confirm";
import type { AgentTrace } from "./agent-trace";
import type { AgentActionCard } from "./agent";

export type AgentExecutorContext = {
  tenantId: string;
  actions: AgentActionCard[];
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
  pendingConfirmation?: AgentPendingConfirmation | null;
  onPendingChange?: (pending: AgentPendingConfirmation | null) => void;
  trace?: AgentTrace;
};

export function buildToolExecutor(ctx: AgentExecutorContext) {
  const { tenantId, actions, userMessage, approvalDefaults, onPendingChange, trace } = ctx;
  let pending = ctx.pendingConfirmation ?? null;

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
      toolArgs: args,
      userMessage,
      approvalDefaults,
      pendingConfirmation: pending,
    });

    if (!confirmation.allowed) {
      if (confirmation.setPending) {
        pending = confirmation.setPending;
        onPendingChange?.(pending);
      }
      return JSON.stringify({
        error: confirmation.reason,
        confirmationRequired: true,
        tool: name,
        pendingId: confirmation.setPending?.id ?? pending?.id,
        pendingLabel: confirmation.setPending?.label ?? pending?.label,
      });
    }

    if (confirmation.clearPending) {
      pending = null;
      onPendingChange?.(null);
    }

    const startedAt = Date.now();
    trace?.startSpan(`tool:${name}`, { argKeys: Object.keys(args) });

    try {
      const result = await executeShipflowTool({ userId: tenantId, actions }, name, args);
      trace?.recordTool(name, startedAt, true);
      return result;
    } catch (error) {
      trace?.recordTool(name, startedAt, false);
      const message = error instanceof ServiceError ? error.message : "Tool failed";
      return JSON.stringify({ error: message });
    }
  };
}
