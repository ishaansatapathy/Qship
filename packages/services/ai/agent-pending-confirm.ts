/** Pending human confirmation for a specific agent tool call. */
export type AgentPendingConfirmation = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  label: string;
  proposedAt: string;
};

const TOOL_LABELS: Record<string, string> = {
  generate_feature_prd: "Generate PRD",
  generate_feature_tasks: "Generate engineering tasks",
  implement_feature_code: "Implement feature code",
  run_ai_review: "Run AI review",
  request_human_review: "Request human review",
  approve_feature: "Approve feature",
  reject_feature: "Reject feature",
  request_changes: "Request changes",
  ship_feature: "Ship feature",
};

export function describePendingAction(tool: string, args: Record<string, unknown>): string {
  const base = TOOL_LABELS[tool] ?? tool;
  const featureId = typeof args.id === "string" ? args.id.trim() : "";
  return featureId ? `${base} (${featureId})` : base;
}

export function createPendingConfirmation(
  tool: string,
  args: Record<string, unknown>,
): AgentPendingConfirmation {
  return {
    id: crypto.randomUUID(),
    tool,
    args,
    label: describePendingAction(tool, args),
    proposedAt: new Date().toISOString(),
  };
}

export function pendingMatchesTool(
  pending: AgentPendingConfirmation | null | undefined,
  toolName: string,
): boolean {
  return Boolean(pending && pending.tool === toolName);
}

export function isPendingExpired(
  pending: AgentPendingConfirmation,
  maxAgeMs = 30 * 60_000,
): boolean {
  const age = Date.now() - new Date(pending.proposedAt).getTime();
  return age > maxAgeMs;
}
