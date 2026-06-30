/**
 * agent-core.ts
 *
 * Shared pipeline used by both runAgentChat (non-streaming) and
 * runAgentChatStream (streaming with SSE callbacks).
 *
 * Centralising here eliminates the ~90 % duplication between agent.ts and
 * agent-stream.ts and ensures both paths apply every guard, sanitisation,
 * and observability step identically.
 */

import { logger } from "@repo/logger";
import { ServiceError } from "../errors";
import { incrementSharedCounter } from "../observability/counters";
import { isOpenAiConfigured } from "./openai";
import type { OpenAiConversationMessage } from "./openai-tools";
import { runOpenAiToolLoop, MAX_TOOL_ROUNDS } from "./openai-tools";
import {
  detectInjectionAttempt,
  estimateAgentContextTokens,
  MAX_AGENT_CONTEXT_TOKENS,
  scanUserMessagesForInjection,
} from "./agent-guard";
import { AGENT_TOOLS } from "./agent-internals";
import { buildToolExecutor } from "./agent-executor";
import {
  createToolMemoryTracker,
  loadAgentApprovalDefaults,
  prepareAgentRun,
  sanitizeClientHistory,
  sanitizeClientToolMemory,
} from "./agent-run";
import { summarizeToolResult } from "./agent-tool-memory";
import type { AgentToolMemoryEntry } from "./agent-tool-memory";
import type { AgentFocus } from "./agent-focus";
import type { AgentActionCard, AgentChatResult, AgentHistoryMessage } from "./agent";
import { AgentTrace } from "./agent-trace";
import { exportAgentTrace } from "./agent-trace-export";

export type AgentCoreInput = {
  message: string;
  history?: AgentHistoryMessage[];
  userEmail?: string;
  focus?: AgentFocus;
  toolMemory?: AgentToolMemoryEntry[];
};

export type AgentCoreCallbacks = {
  /** Called before each tool executes — used by streaming path for SSE status events. */
  onToolCall?: (toolName: string) => void;
  /** Called for each streamed token delta from OpenAI. */
  onTokenDelta?: (delta: string) => void;
  /** AbortSignal wired from the HTTP request. */
  signal?: AbortSignal;
  /** Existing trace ID to continue (stream path passes this from session). */
  traceId?: string;
};

/**
 * Core agent pipeline.  Both sync (`runAgentChat`) and streaming
 * (`runAgentChatStream`) delegate here, passing different callbacks.
 * The channel string is used only for log messages.
 */
export async function runAgentCorePipeline(
  tenantId: string,
  input: AgentCoreInput,
  callbacks: AgentCoreCallbacks = {},
  channel: "run" | "stream",
): Promise<AgentChatResult & { walkthroughTaskId?: string | null }> {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  // ── 1. Injection guard (current message + full user history) ───────────────
  const injectionCheck = detectInjectionAttempt(input.message);
  if (injectionCheck.flagged) {
    incrementSharedCounter("agent.injection_blocked");
    logger.warn("agent.injection_attempt_blocked", {
      tenantId,
      reason: injectionCheck.reason,
      messagePreview: input.message.slice(0, 200),
    });
    return {
      reply:
        "I can't process that request as it appears to contain instructions that could compromise security. " +
        "If you were trying to do something specific, please rephrase it.",
      actions: [],
    };
  }

  // ── 2. Server-side sanitise client-supplied slices ────────────────────────
  const safeHistory = sanitizeClientHistory(input.history);
  const historyInjection = scanUserMessagesForInjection(safeHistory);
  if (historyInjection.flagged) {
    incrementSharedCounter("agent.injection_blocked_history");
    logger.warn("agent.history_injection_blocked", {
      tenantId,
      reason: historyInjection.reason,
    });
    return {
      reply:
        "I detected unsafe instructions in the conversation history and can't continue this session safely. " +
        "Please start a new conversation.",
      actions: [],
    };
  }

  const safeToolMemory = sanitizeClientToolMemory(input.toolMemory);

  // ── 3. Prepare run context (system prompt + memory + focus) ───────────────
  const approvalDefaults = await loadAgentApprovalDefaults(tenantId);
  const trace = new AgentTrace(callbacks.traceId);

  const prepared = await prepareAgentRun(
    tenantId,
    { ...input, history: safeHistory, toolMemory: safeToolMemory },
    approvalDefaults,
  );

  // ── 4. Full context token estimate (system prompt + tools + history) ───────
  const fullMessages: OpenAiConversationMessage[] = [
    { role: "system", content: prepared.systemPrompt },
    ...prepared.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.message.trim() },
  ];
  const estimatedTokens = estimateAgentContextTokens(
    fullMessages,
    prepared.systemPrompt,
    AGENT_TOOLS,
  );
  if (estimatedTokens > MAX_AGENT_CONTEXT_TOKENS) {
    incrementSharedCounter("agent.context_too_large");
    logger.warn("agent.context_too_large", { tenantId, estimatedTokens });
    return {
      reply: "The conversation history is too long for me to process safely. Please start a new conversation.",
      actions: [],
    };
  }

  // ── 5. Build executor ─────────────────────────────────────────────────────
  const actions: AgentActionCard[] = [];
  const memoryTracker = createToolMemoryTracker(prepared, safeToolMemory);
  const baseExecutor = buildToolExecutor({
    tenantId,
    actions,
    userMessage: input.message.trim(),
    approvalDefaults,
    trace,
  });

  let walkthroughTaskIdUpdate: string | null | undefined;

  const executeTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    callbacks.onToolCall?.(name);
    const result = await baseExecutor(name, args);
    memoryTracker.track(summarizeToolResult(name, result, args));
    // Walkthrough task tracking (used by stream path for session persistence)
    if (name === "advance_task_walkthrough" || name === "explain_engineering_task") {
      try {
        const parsed = JSON.parse(result) as { completed?: boolean; taskId?: string };
        if (name === "advance_task_walkthrough" && parsed.completed) {
          walkthroughTaskIdUpdate = null;
        } else if (parsed.taskId) {
          walkthroughTaskIdUpdate = parsed.taskId;
        }
      } catch {
        /* non-JSON tool errors are surfaced to the model as plain text */
      }
    }
    return result;
  };

  // ── 6. Run the tool loop ──────────────────────────────────────────────────
  const { content } = await runOpenAiToolLoop(fullMessages, AGENT_TOOLS, executeTool, {
    maxRounds: MAX_TOOL_ROUNDS,
    timeoutMs: 120_000,
    onToken: callbacks.onTokenDelta,
    signal: callbacks.signal,
  });

  // ── 7. Observability ──────────────────────────────────────────────────────
  logger.info(`agent.${channel}.completed`, {
    ...trace.toLogPayload(),
    tenantId,
    toolCalls: memoryTracker.getNewEntries().length,
    focusCleared: prepared.focusCleared,
  });
  await exportAgentTrace(trace, { tenantId, channel });

  return {
    reply: content,
    actions,
    focusCleared: prepared.focusCleared,
    effectiveFocus: prepared.effectiveFocus,
    toolMemory: memoryTracker.getMergedMemory(),
    newToolMemoryEntries: memoryTracker.getNewEntries(),
    walkthroughTaskId: walkthroughTaskIdUpdate,
    traceId: trace.traceId,
    traceSpans: trace.toSpans(),
  };
}
