/**
 * Streaming wrapper around the shared agent core pipeline.
 *
 * Accepts an `onToolCall` callback invoked before each tool so the HTTP layer
 * can push SSE "status" events to the client (real-time "Searching inbox…" UX).
 * All logic — guards, sanitisation, memory, token counting — lives in
 * agent-core.ts to prevent this path from diverging from runAgentChat.
 */
import type { AgentChatResult, AgentHistoryMessage } from "./agent";
import type { AgentToolMemoryEntry } from "./agent-tool-memory";
import type { AgentFocus } from "./agent-focus";
import { runAgentCorePipeline } from "./agent-core";

export async function runAgentChatStream(
  tenantId: string,
  input: {
    message: string;
    history?: AgentHistoryMessage[];
    userEmail?: string;
    focus?: AgentFocus;
    toolMemory?: AgentToolMemoryEntry[];
  },
  onToolCall: (toolName: string) => void,
  onTokenDelta?: (delta: string) => void,
  opts?: { signal?: AbortSignal; traceId?: string },
): Promise<AgentChatResult> {
  return runAgentCorePipeline(
    tenantId,
    input,
    {
      onToolCall,
      onTokenDelta,
      signal: opts?.signal,
      traceId: opts?.traceId,
    },
    "stream",
  );
}
