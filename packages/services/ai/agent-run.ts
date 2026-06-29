import type { ApprovalDefaults } from "../settings";
import { getSettingsService } from "../settings";
import { applyHistoryCompaction } from "./agent-compaction";
import { buildFocusSystemAppendix, type AgentFocus } from "./agent-focus";
import type { AgentHistoryMessage } from "./agent";
import { buildSystemPromptFor } from "./agent-internals";
import { detectTopicShift } from "./agent-topic-shift";
import { formatRetrievedMemoryForPrompt } from "./agent-memory-retrieval";
import { formatToolMemoryForPrompt, type AgentToolMemoryEntry } from "./agent-tool-memory";

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
    return {
      autoApproveEmail: false,
      autoApproveAgentEmail: false,
      autoApproveCalendar: false,
    };
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
