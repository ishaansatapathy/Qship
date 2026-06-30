import { isOpenAiConfigured } from "./openai";
import type { AgentFocus } from "./agent-focus";
import type { AgentTraceSpan } from "./agent-trace";
import { runAgentCorePipeline } from "./agent-core";

export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentActionCard = {
  kind:
    | "email_queued"
    | "calendar_queued"
    | "inbox_search"
    | "inbox_ranked"
    | "queue_list"
    | "context"
    | "calendar"
    | "email"
    | "feature_list"
    | "feature_created"
    | "feature_education"
    | "feature_detail"
    | "feature_tasks"
    | "ai_review"
    | "pipeline_summary"
    | "github_repos";
  title: string;
  detail?: string;
  href?: string;
  lines?: string[];
  disposition?: "sent" | "queued";
  queueItemId?: string;
  contextId?: string;
};

export type AgentChatResult = {
  reply: string;
  actions: AgentActionCard[];
  focusCleared?: boolean;
  effectiveFocus?: AgentFocus;
  toolMemory?: import("./agent-tool-memory").AgentToolMemoryEntry[];
  newToolMemoryEntries?: import("./agent-tool-memory").AgentToolMemoryEntry[];
  /** Updated when walkthrough tools advance or explain a new task. */
  walkthroughTaskId?: string | null;
  traceId?: string;
  traceSpans?: AgentTraceSpan[];
};

export function isAgentConfigured() {
  return isOpenAiConfigured();
}

export async function runAgentChat(
  tenantId: string,
  input: {
    message: string;
    history?: AgentHistoryMessage[];
    userEmail?: string;
    focus?: AgentFocus;
    toolMemory?: import("./agent-tool-memory").AgentToolMemoryEntry[];
  },
): Promise<AgentChatResult> {
  return runAgentCorePipeline(tenantId, input, {}, "run");
}
