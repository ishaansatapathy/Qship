/**
 * Shared tool-executor factory for the ShipFlow Agent.
 * Delegates exclusively to ShipFlow MCP tools (37 tools — CI parity verified).
 */

import type { ApprovalDefaults } from "../settings";
import { ServiceError } from "../errors";
import { incrementSharedCounter } from "../observability/counters";
import { executeShipflowTool, isShipflowTool } from "../shipflow-agent-tools";
import { validateShipflowToolArgs } from "../shipflow-agent-tools/validate-args";
import { checkAgentToolConfirmation } from "./agent-tool-confirm";
import { detectToolArgInjection } from "./agent-guard";
import type { AgentTrace } from "./agent-trace";
import type { AgentActionCard } from "./agent";

export type AgentExecutorContext = {
  tenantId: string;
  actions: AgentActionCard[];
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
  trace?: AgentTrace;
};

export type GuardedToolExecuteInput = {
  tenantId: string;
  actions: AgentActionCard[];
  toolName: string;
  toolArgs: Record<string, unknown>;
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
  trace?: AgentTrace;
  channel?: "agent" | "mcp";
};

/**
 * Single guarded execution path shared by the agent tool loop and MCP `tools/call`.
 * Applies whitelist, arg schema validation, injection scan, confirmation gates, and tracing.
 */
export async function executeGuardedShipflowTool(input: GuardedToolExecuteInput): Promise<string> {
  const {
    tenantId,
    actions,
    toolName,
    toolArgs,
    userMessage,
    approvalDefaults,
    trace,
    channel = "agent",
  } = input;

  if (!isShipflowTool(toolName)) {
    incrementSharedCounter(`${channel}.tool_blocked_unknown`);
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  const argValidation = validateShipflowToolArgs(toolName, toolArgs);
  if (!argValidation.valid) {
    incrementSharedCounter(`${channel}.tool_blocked_invalid_args`);
    return JSON.stringify({ error: argValidation.error, blocked: true });
  }

  const argInjection = detectToolArgInjection(toolArgs);
  if (argInjection.flagged) {
    incrementSharedCounter(`${channel}.tool_blocked_injection`);
    return JSON.stringify({
      error: argInjection.reason,
      blocked: true,
    });
  }

  const confirmation = checkAgentToolConfirmation({
    toolName,
    toolArgs,
    userMessage,
    approvalDefaults,
  });

  if (!confirmation.allowed) {
    incrementSharedCounter(`${channel}.tool_blocked_confirmation`);
    return JSON.stringify({
      error: confirmation.reason,
      confirmationRequired: true,
      tool: toolName,
    });
  }

  const startedAt = Date.now();
  trace?.startSpan(`tool:${toolName}`, { argKeys: Object.keys(toolArgs) });

  try {
    const result = await executeShipflowTool({ userId: tenantId, actions }, toolName, toolArgs);
    trace?.recordTool(toolName, startedAt, true);
    incrementSharedCounter(`${channel}.tool_executed`);
    return result;
  } catch (error) {
    trace?.recordTool(toolName, startedAt, false);
    incrementSharedCounter(`${channel}.tool_failed`);
    const message = error instanceof ServiceError ? error.message : "Tool failed";
    return JSON.stringify({ error: message });
  }
}

export function buildToolExecutor(ctx: AgentExecutorContext) {
  const { tenantId, actions, userMessage, approvalDefaults, trace } = ctx;

  return async (name: string, args: Record<string, unknown>): Promise<string> =>
    executeGuardedShipflowTool({
      tenantId,
      actions,
      toolName: name,
      toolArgs: args,
      userMessage,
      approvalDefaults,
      trace,
      channel: "agent",
    });
}
