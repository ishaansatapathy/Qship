/**
 * agent-guard.ts
 *
 * All agent-level security controls live here so they can be tested in
 * isolation and imported without pulling in the full agent runtime.
 *
 * Layers implemented:
 *  1. Prompt-injection detection  — catches known attack patterns in the
 *     user's own message before the OpenAI call is even made.
 *  2. Email arg validation        — legacy Gmail path (exported + tested; inactive while
 *     ShipFlow agent has no inbox send tools).
 *  3. Per-session send cap        — legacy Gmail path (same as above).
 *  4. Email-content data fence    — legacy Gmail path (same as above).
 *  5. Token-count estimation      — rough approximation to catch
 *     history-stuffing attacks before they hit the API.
 */

import { z } from "zod";
import { ServiceError } from "../errors";
import type { OpenAiConversationMessage } from "./openai-tools";

// ---------------------------------------------------------------------------
// 1. Prompt-injection detection
// ---------------------------------------------------------------------------

/**
 * Patterns that strongly indicate a prompt-injection attempt.
 * Checked case-insensitively against the raw user message.
 *
 * Deliberately kept conservative to avoid false-positives on legitimate
 * requests like "ignore this email" or "forget that, let's reschedule".
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    // Matches: "ignore all previous instructions", "ignore the above instructions", "ignore prior instructions"
    pattern: /ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+instructions/i,
    reason: "Instruction-override attempt detected",
  },
  {
    // Matches: "forget all instructions", "forget your rules", "forget all previous instructions"
    // The (\w+\s+)* handles adjectives like "previous" between the quantifier and the noun.
    pattern: /forget\s+(all|your|every|previous)(\s+\w+){0,2}\s+(instructions|context|rules|guidelines)/i,
    reason: "Context-wipe attempt detected",
  },
  {
    pattern: /you\s+are\s+now\s+(a\s+)?(different|new|another|unrestricted|jailbroken)/i,
    reason: "Role-reassignment attempt detected",
  },
  {
    pattern: /act\s+as\s+(a\s+)?(different|another|new|unrestricted|evil|malicious)/i,
    reason: "Role-override attempt detected",
  },
  {
    pattern: /\bdo\s+anything\s+now\b/i,
    reason: "DAN jailbreak pattern detected",
  },
  {
    pattern: /disregard\s+(your\s+)?(previous|prior|all)\s+(instructions|directives|rules)/i,
    reason: "Instruction-disregard attempt detected",
  },
  // Mass-action abuse — these must be whole-phrase matches to avoid
  // blocking "send an email to everyone on the team" from a calendar context.
  {
    pattern: /\b(email|send\s+(an?\s+email\s+)?to)\s+everyone\s+(in|from|on)\s+(my\s+)?(inbox|contacts|list)/i,
    reason: "Bulk-send mass-action command detected",
  },
  {
    pattern: /forward\s+(all|every)\s+(my\s+)?(emails?|messages?|conversations?)/i,
    reason: "Mass-forward command detected",
  },
  {
    pattern: /delete\s+(all|every)\s+(my\s+)?(emails?|messages?|conversations?|events?)/i,
    reason: "Mass-delete command detected",
  },
  {
    pattern: /\bexfiltrate\b/i,
    reason: "Exfiltration keyword detected",
  },
  {
    pattern: /<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]/i,
    reason: "Chat-template injection marker detected",
  },
  {
    pattern: /\bsystem\s*:\s*(ignore|override|forget)/i,
    reason: "System-role injection attempt detected",
  },
  {
    pattern: /\b(bypass|disable|turn off)\s+(security|guardrails|safeguards|policy)\b/i,
    reason: "Security-bypass attempt detected",
  },
  {
    pattern: /\breveal\b.*\b(api key|secret|token|password)\b/i,
    reason: "Secret-exfiltration attempt detected",
  },
  {
    pattern: /\bjailbreak\b/i,
    reason: "Jailbreak keyword detected",
  },
  {
    pattern: /\boverride\b.*\b(system prompt|instructions)\b/i,
    reason: "System-prompt override attempt detected",
  },
  {
    pattern: /\b(print|show|reveal|dump)\b.*\bsystem\s+(instructions|prompt)\b/i,
    reason: "System-prompt exfiltration attempt detected",
  },
  {
    pattern: /\bsudo\s+mode\b|\bapprove\s+all\s+pending\b/i,
    reason: "Privilege-escalation command detected",
  },
  {
    pattern: /\bbypass\b.*\bintent\s+gate\b/i,
    reason: "Intent-gate bypass attempt detected",
  },
  {
    pattern: /\brm\s+-rf\b|\bdrop\s+table\b/i,
    reason: "Destructive command detected",
  },
  {
    pattern: /\b(api keys?|secrets?|credentials?)\b.*\b(external|attacker|evil|url)\b/i,
    reason: "Credential exfiltration attempt detected",
  },
  {
    pattern: /\bpretend\b.*\b(user|they)\s+said\b/i,
    reason: "False-confirmation injection detected",
  },
];

export type InjectionCheckResult =
  | { flagged: false }
  | { flagged: true; reason: string };

/**
 * Scans a raw user message for known prompt-injection and mass-action patterns.
 * Returns immediately on the first match.
 *
 * This is a defence-in-depth layer — it blocks the most common, literal
 * attack forms. Sophisticated paraphrased injections that arrive through
 * email content are handled by data-fencing (see below).
 */
export function detectInjectionAttempt(message: string): InjectionCheckResult {
  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { flagged: true, reason };
    }
  }
  return { flagged: false };
}

const TOOL_ARG_INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+instructions/i,
    reason: "Tool argument contains instruction override",
  },
  {
    pattern: /<\|im_start\|>|<\|im_end\|>|\[INST\]/i,
    reason: "Tool argument contains template injection marker",
  },
  {
    pattern: /\bsystem\s*:\s*/i,
    reason: "Tool argument contains system-role prefix",
  },
  {
    pattern: /\b(bypass|disable)\s+(security|guardrails|policy)\b/i,
    reason: "Tool argument attempts security bypass",
  },
];

/**
 * Secondary defence: scan string tool arguments before execution.
 */
export function detectToolArgInjection(args: Record<string, unknown>): InjectionCheckResult {
  for (const value of Object.values(args)) {
    if (typeof value !== "string") continue;
    for (const { pattern, reason } of TOOL_ARG_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return { flagged: true, reason };
      }
    }
  }
  return { flagged: false };
}

// ---------------------------------------------------------------------------
// 2. Email arg validation
// ---------------------------------------------------------------------------

/** Stripped-down CRLF-safe header sanitizer (mirrors validation/email.ts). */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

const recipientSchema = z
  .string()
  .min(3)
  .max(320)
  .transform(sanitizeHeader)
  .refine(
    (v) => {
      const bracket = v.match(/<([^>]+)>/);
      const addr = bracket?.[1] ?? v;
      return z.string().email().safeParse(addr.trim()).success;
    },
    { message: "Invalid recipient email address" },
  );

const subjectSchema = z
  .string()
  .min(1)
  .max(998)
  .transform(sanitizeHeader)
  .refine((v) => v.length > 0, { message: "Email subject is required" });

const bodySchema = z.string().min(1).max(100_000);

export type ValidatedEmailArgs = {
  to: string;
  subject: string;
  body: string;
};

/**
 * Validates and sanitises the to/subject/body arguments produced by the LLM
 * before they reach the queue service.  Throws a ServiceError on failure so
 * the tool result returned to the LLM is a structured error, not a crash.
 */
export function validateAgentEmailArgs(args: Record<string, unknown>): ValidatedEmailArgs {
  const toResult = recipientSchema.safeParse(String(args.to ?? ""));
  if (!toResult.success) {
    throw new ServiceError(
      "BAD_REQUEST",
      `Invalid recipient address: ${toResult.error.issues[0]?.message ?? "unknown error"}`,
    );
  }

  const subjectResult = subjectSchema.safeParse(String(args.subject ?? ""));
  if (!subjectResult.success) {
    throw new ServiceError(
      "BAD_REQUEST",
      `Invalid subject: ${subjectResult.error.issues[0]?.message ?? "unknown error"}`,
    );
  }

  const bodyResult = bodySchema.safeParse(String(args.body ?? ""));
  if (!bodyResult.success) {
    throw new ServiceError(
      "BAD_REQUEST",
      `Invalid body: ${bodyResult.error.issues[0]?.message ?? "unknown error"}`,
    );
  }

  return {
    to: toResult.data,
    subject: subjectResult.data,
    body: bodyResult.data,
  };
}

// ---------------------------------------------------------------------------
// 3. Per-session send cap
// ---------------------------------------------------------------------------

/** Default maximum "send"-mode emails per runAgentChat call. */
export const DEFAULT_AGENT_SEND_CAP = 3;

export type SendCounter = { count: number };

/**
 * Increments the send counter and throws if the per-session cap is exceeded.
 * Pass the same counter object for every queue_email(mode=send) call within
 * a single runAgentChat invocation.
 */
export function enforceEmailSendCap(
  counter: SendCounter,
  cap: number = DEFAULT_AGENT_SEND_CAP,
): void {
  counter.count += 1;
  if (counter.count > cap) {
    throw new ServiceError(
      "BAD_REQUEST",
      `Agent send limit reached (max ${cap} emails per request). ` +
        `Please use the Compose tab for additional emails or break your request into multiple messages.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Email-content data fence
// ---------------------------------------------------------------------------

const DATA_FENCE_START = "[EMAIL_DATA_START]";
const DATA_FENCE_END = "[EMAIL_DATA_END]";

/**
 * Wraps raw email content (snippets, bodies) in data-fence markers so the
 * LLM can cleanly distinguish untrusted email content from trusted instructions.
 * The system prompt must instruct the model to treat fenced content as data only.
 */
export function fenceEmailData(content: string): string {
  // Strip any existing fence markers to prevent nesting attacks.
  const cleaned = content
    .replace(/\[EMAIL_DATA_START\]/g, "[DATA]")
    .replace(/\[EMAIL_DATA_END\]/g, "[/DATA]");
  return `${DATA_FENCE_START}\n${cleaned}\n${DATA_FENCE_END}`;
}

// ---------------------------------------------------------------------------
// 5. Token-count estimation
// ---------------------------------------------------------------------------

/**
 * Rough approximation: 1 token ≈ 4 chars of English text.
 * Used to guard against history-stuffing (very long conversation histories
 * that inflate context windows and costs). Not used for billing.
 * @deprecated Prefer estimateAgentContextTokens for accuracy.
 */
export function estimateTokenCount(messages: OpenAiConversationMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    chars += content.length;
    // Add overhead for role and message framing tokens (~4 each).
    chars += 16;
  }
  return Math.ceil(chars / 4);
}

/**
 * Accurate context estimate that includes the system prompt and all tool schemas
 * in addition to the conversation history.
 *
 * The previous `estimateTokenCount` only counted history messages, silently
 * ignoring ~2–4 k tokens of system prompt and ~8–10 k tokens of tool definitions.
 * This caused the guard to under-count by 25–50 %, potentially allowing contexts
 * that exceed the model's window.
 */
export function estimateAgentContextTokens(
  messages: OpenAiConversationMessage[],
  systemPrompt?: string,
  tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
): number {
  let chars = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    chars += content.length;
    chars += 16; // framing overhead per message
  }
  if (systemPrompt) chars += systemPrompt.length;
  if (tools) chars += JSON.stringify(tools).length;
  return Math.ceil(chars / 4);
}

/** Max estimated tokens we'll allow in a single agent call's context (history + system + tools). */
export const MAX_AGENT_CONTEXT_TOKENS = 50_000;
