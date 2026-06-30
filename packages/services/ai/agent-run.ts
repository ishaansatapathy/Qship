import type { ApprovalDefaults } from "../settings";
import { fallbackApprovalDefaults, getSettingsService } from "../settings";
import { applyHistoryCompaction } from "./agent-compaction";
import { buildFocusSystemAppendix, type AgentFocus } from "./agent-focus";
import type { AgentHistoryMessage } from "./agent";
import { buildSystemPromptFor } from "./agent-internals";
import { detectTopicShift } from "./agent-topic-shift";
import { formatRetrievedMemoryForPrompt } from "./agent-memory-retrieval";
import { formatToolMemoryForPrompt, MAX_TOOL_MEMORY_ENTRIES, type AgentToolMemoryEntry } from "./agent-tool-memory";

// ── Client-payload sanitisation ───────────────────────────────────────────────

const MAX_HISTORY_MESSAGE_CHARS = 8_000;
const VALID_HISTORY_ROLES = new Set<string>(["user", "assistant"]);

/**
 * Sanitises the conversation history sent from the browser before it enters
 * the agent runtime.  Strips entries with invalid roles, trims oversized
 * messages, and removes blank content — preventing history-stuffing and
 * trust-boundary violations.
 */
export function sanitizeClientHistory(
  history: AgentHistoryMessage[] | undefined,
): AgentHistoryMessage[] {
  if (!history) return [];
  return history
    .filter((m) => VALID_HISTORY_ROLES.has(m.role) && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_HISTORY_MESSAGE_CHARS),
    }))
    .filter((m) => m.content.trim().length > 0);
}

/**
 * Sanitises tool-memory entries sent from the browser.
 * Caps count to the server-side maximum to prevent prompt-stuffing.
 */
export function sanitizeClientToolMemory(
  toolMemory: AgentToolMemoryEntry[] | undefined,
): AgentToolMemoryEntry[] {
  if (!toolMemory) return [];
  return toolMemory.slice(-MAX_TOOL_MEMORY_ENTRIES);
}

export function isFocusedAgentContext(focus: AgentFocus | undefined): boolean {
  return (
    Boolean(focus?.contextId?.trim()) ||
    Boolean(focus?.eventId?.trim()) ||
    Boolean(focus?.walkthroughTaskId?.trim())
  );
}

export function prepareHistoryForAgent(
  history: AgentHistoryMessage[] | undefined,
  focus: AgentFocus | undefined,
): { history: AgentHistoryMessage[]; compactionAppendix: string } {
  return applyHistoryCompaction(history, isFocusedAgentContext(focus));
}

export function trimAgentHistory(
  history: AgentHistoryMessage[] | undefined,
  focus: AgentFocus | undefined,
): AgentHistoryMessage[] {
  return prepareHistoryForAgent(history, focus).history;
}

export async function loadAgentApprovalDefaults(userId: string): Promise<ApprovalDefaults> {
  try {
    return await getSettingsService().getApprovalDefaults(userId);
  } catch {
    return fallbackApprovalDefaults();
  }
}

export type AgentRunInput = {
  message: string;
  history?: AgentHistoryMessage[];
  userEmail?: string;
  focus?: AgentFocus;
  toolMemory?: AgentToolMemoryEntry[];
};

export type PreparedAgentRun = {
  effectiveFocus: AgentFocus | undefined;
  focusCleared: boolean;
  topicShiftReason?: string;
  history: AgentHistoryMessage[];
  compactionAppendix: string;
  systemPrompt: string;
  newToolMemoryEntries: AgentToolMemoryEntry[];
};

export async function prepareAgentRun(
  tenantId: string,
  input: AgentRunInput,
  approvalDefaults: ApprovalDefaults,
): Promise<PreparedAgentRun> {
  const topicShift = detectTopicShift(input.message, input.focus, input.toolMemory ?? []);
  const effectiveFocus = topicShift.shouldClearFocus ? undefined : input.focus;
  const { history, compactionAppendix } = prepareHistoryForAgent(input.history, effectiveFocus);

  const focusAppendix = await buildFocusSystemAppendix(tenantId, effectiveFocus, input.userEmail);
  const retrievedMemory = formatRetrievedMemoryForPrompt(input.message, input.toolMemory ?? []);
  const toolMemoryAppendix = formatToolMemoryForPrompt(retrievedMemory);
  const systemPrompt =
    buildSystemPromptFor(input.userEmail, approvalDefaults) +
    compactionAppendix +
    toolMemoryAppendix +
    focusAppendix;

  return {
    effectiveFocus,
    focusCleared: topicShift.shouldClearFocus,
    topicShiftReason: topicShift.reason,
    history,
    compactionAppendix,
    systemPrompt,
    newToolMemoryEntries: [],
  };
}

export function createToolMemoryTracker(
  prepared: PreparedAgentRun,
  existing: AgentToolMemoryEntry[],
) {
  const entries = [...prepared.newToolMemoryEntries];

  return {
    track(entry: AgentToolMemoryEntry | null) {
      if (entry) entries.push(entry);
    },
    getMergedMemory() {
      if (entries.length === 0) return existing;
      return [...existing, ...entries].slice(-12);
    },
    getNewEntries() {
      return entries;
    },
  };
}
