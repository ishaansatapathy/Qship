import type { ApprovalDefaults } from "../settings";

/** Tools that mutate delivery state or trigger async workflows — need clear user intent in the same turn. */
export const AGENT_CONFIRMATION_TOOLS = new Set([
  // Creation
  "create_feature_request",
  // PRD + planning
  "generate_feature_prd",
  "generate_feature_tasks",
  "implement_feature_code",
  // Review + approval
  "run_ai_review",
  "request_human_review",
  "approve_feature",
  "reject_feature",
  "request_changes",
  // Release
  "ship_feature",
  // Explicit status advancement
  "update_feature_status",
]);

const TOOL_INTENT_PATTERNS: Record<string, RegExp[]> = {
  create_feature_request: [
    /\b(create|submit|add|log|file)\b.*\b(feature|request|idea)\b/i,
    /\bnew\s+(feature|request)\b/i,
    /\bfeature\s+(request|submission)\b/i,
  ],
  update_feature_status: [
    /\b(update|change|move|set)\b.*\bstatus\b/i,
    /\bmove\b.*\b(to|stage)\b/i,
    /\bmark\b.*\b(as|status)\b/i,
  ],
  generate_feature_prd: [
    /\bgenerate\b.*\bprd\b/i,
    /\bcreate\b.*\bprd\b/i,
    /\bwrite\b.*\bprd\b/i,
    /\bprd\b.*\b(for|on)\b/i,
    /\bdraft\b.*\bprd\b/i,
  ],
  generate_feature_tasks: [
    /\bgenerate\b.*\btasks?\b/i,
    /\bcreate\b.*\b(engineering\s+)?tasks?\b/i,
    /\bbreak\b.*\b(into\s+)?tasks?\b/i,
    /\btaskify\b/i,
  ],
  implement_feature_code: [
    /\bimplement\b.*\b(code|feature)\b/i,
    /\bwrite\b.*\bcode\b/i,
    /\bstart\b.*\b(coding|development)\b/i,
  ],
  run_ai_review: [
    /\brun\b.*\bai review\b/i,
    /\bai review\b.*\b(for|on|this)\b/i,
    /\breview\b.*\bfeature\b/i,
    /\bkick off\b.*\breview\b/i,
  ],
  request_human_review: [
    /\brequest\b.*\bhuman review\b/i,
    /\bhand off\b.*\breview\b/i,
    /\bhand off to human review\b/i,
  ],
  approve_feature: [
    /\bapprove\b.*\b(feature|request|this)\b/i,
    /\bapprove\b.*\bfor release\b/i,
    /\bI approve\b/i,
  ],
  reject_feature: [/\breject\b.*\b(feature|request|this)\b/i],
  request_changes: [/\brequest\b.*\bchanges\b/i, /\bchanges requested\b/i],
  ship_feature: [
    /\bship\b.*\b(feature|this|it|request)\b/i,
    /\bdeploy\b.*\b(prod|production)\b/i,
    /\bmark\b.*\bshipped\b/i,
  ],
};

export type AgentToolConfirmationResult =
  | {
      allowed: true;
      reason?: "auto_approve" | "explicit_intent" | "not_required";
    }
  | {
      allowed: false;
      reason: string;
    };

function hasExplicitToolIntent(toolName: string, message: string): boolean {
  const patterns = TOOL_INTENT_PATTERNS[toolName];
  if (!patterns) return false;
  return patterns.some((re) => re.test(message));
}

export function checkAgentToolConfirmation(input: {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
}): AgentToolConfirmationResult {
  if (!AGENT_CONFIRMATION_TOOLS.has(input.toolName)) {
    return { allowed: true, reason: "not_required" };
  }

  if (input.approvalDefaults.autoApproveAgentEmail) {
    return { allowed: true, reason: "auto_approve" };
  }

  if (hasExplicitToolIntent(input.toolName, input.userMessage.trim())) {
    return { allowed: true, reason: "explicit_intent" };
  }

  return {
    allowed: false,
    reason:
      `The user did not ask to run ${input.toolName} in this message. ` +
      "Explain what you would do and ask them to request it clearly in one message (e.g. generate a PRD for this feature).",
  };
}
