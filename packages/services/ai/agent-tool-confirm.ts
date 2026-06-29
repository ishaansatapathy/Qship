import type { ApprovalDefaults } from "../settings";

/** Tools that mutate delivery state or trigger async workflows — require explicit user intent. */
export const AGENT_CONFIRMATION_TOOLS = new Set([
  "generate_feature_prd",
  "generate_feature_tasks",
  "implement_feature_code",
  "run_ai_review",
  "request_human_review",
  "approve_feature",
  "reject_feature",
  "request_changes",
  "ship_feature",
]);

const AFFIRMATIVE_RE =
  /^(yes|yep|yeah|sure|ok|okay|go ahead|do it|proceed|confirm|approved?|ship it|please do)\b/i;

const TOOL_INTENT_PATTERNS: Record<string, RegExp[]> = {
  generate_feature_prd: [
    /\bgenerate\b.*\bprd\b/i,
    /\bcreate\b.*\bprd\b/i,
    /\bwrite\b.*\bprd\b/i,
    /\bprd\b.*\b(for|on)\b/i,
  ],
  generate_feature_tasks: [
    /\bgenerate\b.*\btasks?\b/i,
    /\bcreate\b.*\b(engineering\s+)?tasks?\b/i,
    /\bbreak\b.*\b(into\s+)?tasks?\b/i,
  ],
  implement_feature_code: [
    /\bimplement\b.*\b(code|feature)\b/i,
    /\bwrite\b.*\bcode\b/i,
    /\bstart\b.*\b(coding|development)\b/i,
  ],
  run_ai_review: [/\brun\b.*\bai review\b/i, /\bai review\b.*\b(for|on|this)\b/i, /\breview\b.*\bfeature\b/i],
  request_human_review: [/\brequest\b.*\bhuman review\b/i, /\bhand off\b.*\breview\b/i],
  approve_feature: [/\bapprove\b.*\b(feature|request|this)\b/i, /\bapprove\b.*\bfor release\b/i],
  reject_feature: [/\breject\b.*\b(feature|request|this)\b/i],
  request_changes: [/\brequest\b.*\bchanges\b/i, /\bchanges requested\b/i],
  ship_feature: [/\bship\b.*\b(feature|this|it|request)\b/i, /\bdeploy\b.*\b(prod|production)\b/i, /\bmark\b.*\bshipped\b/i],
};

export type AgentToolConfirmationResult =
  | { allowed: true; reason?: "auto_approve" | "explicit_intent" | "affirmative" | "not_required" }
  | { allowed: false; reason: string };

function hasExplicitToolIntent(toolName: string, message: string): boolean {
  const patterns = TOOL_INTENT_PATTERNS[toolName];
  if (!patterns) return false;
  return patterns.some((re) => re.test(message));
}

function isAffirmativeConfirmation(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 80) return false;
  return AFFIRMATIVE_RE.test(trimmed);
}

export function checkAgentToolConfirmation(input: {
  toolName: string;
  userMessage: string;
  approvalDefaults: ApprovalDefaults;
}): AgentToolConfirmationResult {
  if (!AGENT_CONFIRMATION_TOOLS.has(input.toolName)) {
    return { allowed: true, reason: "not_required" };
  }

  if (input.approvalDefaults.autoApproveAgentEmail) {
    return { allowed: true, reason: "auto_approve" };
  }

  const message = input.userMessage.trim();
  if (hasExplicitToolIntent(input.toolName, message)) {
    return { allowed: true, reason: "explicit_intent" };
  }

  if (isAffirmativeConfirmation(message)) {
    return { allowed: true, reason: "affirmative" };
  }

  return {
    allowed: false,
    reason:
      `Human confirmation required before ${input.toolName}. ` +
      "Explain the action and ask the user to confirm (yes / go ahead), or they can enable auto-approve in Settings.",
  };
}
