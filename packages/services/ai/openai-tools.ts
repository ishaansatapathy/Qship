import { ServiceError } from "../errors";

import { fetchOpenAi } from "./openai-fetch";
import { getOpenAiModel, isOpenAiConfigured } from "./openai";

const DEFAULT_TIMEOUT_MS = 60_000;
/** Hard ceiling on tool-call rounds. Must match the maxRounds passed by runAgentChat. */
export const MAX_TOOL_ROUNDS = 10;

// ── Retry helper ──────────────────────────────────────────────────────────────

/** HTTP status codes that are safe to retry with back-off. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Wraps a `fetchOpenAi` call with exponential back-off for transient errors.
 * Retries on 429 (rate-limit) and 5xx (server error) up to MAX_RETRIES times.
 * Non-retryable errors (4xx except 429) are thrown immediately.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const res = await fetchOpenAi(url, init, { label });
    if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
    // Store a placeholder to re-throw if all retries exhaust
    lastError = new Error(`HTTP ${res.status}`);
  }
  throw lastError ?? new Error("OpenAI request failed after retries");
}

export type OpenAiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAiConversationMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function runOpenAiToolLoop(
  messages: OpenAiConversationMessage[],
  tools: OpenAiToolDefinition[],
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  opts?: { maxRounds?: number; timeoutMs?: number; onToken?: (delta: string) => void; signal?: AbortSignal },
): Promise<{ content: string; messages: OpenAiConversationMessage[] }> {
  if (!isOpenAiConfigured()) {
    throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const maxRounds = opts?.maxRounds ?? MAX_TOOL_ROUNDS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const onToken = opts?.onToken;
  const transcript = [...messages];

  for (let round = 0; round < maxRounds; round += 1) {
    if (opts?.signal?.aborted) {
      throw new ServiceError("INTERNAL", "Agent request cancelled.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onExternalAbort);

    let choice: { content?: string | null; tool_calls?: ToolCall[] };

    try {
      choice = await fetchOpenAiChoice(transcript, tools, controller.signal, onToken);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (opts?.signal?.aborted) {
        throw new ServiceError("INTERNAL", "Agent request cancelled.");
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ServiceError("INTERNAL", "OpenAI request timed out.");
      }
      throw new ServiceError("INTERNAL", "OpenAI request failed. Try again shortly.");
    } finally {
      clearTimeout(timeout);
      opts?.signal?.removeEventListener("abort", onExternalAbort);
    }

    if (choice.tool_calls?.length) {
      transcript.push({
        role: "assistant",
        content: choice.content ?? null,
        tool_calls: choice.tool_calls,
      });

      // Run all tool calls for this round in parallel — independent reads and
      // writes are safe to overlap; DB-level optimistic locking handles any
      // conflicts on the same entity.
      const toolResults = await Promise.all(
        choice.tool_calls.map(async (call) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          let result: string;
          try {
            result = await executeTool(call.function.name, args);
          } catch (error) {
            result = JSON.stringify({
              error: error instanceof Error ? error.message : "Tool execution failed",
            });
          }
          return { id: call.id, result };
        }),
      );

      for (const { id, result } of toolResults) {
        transcript.push({ role: "tool", tool_call_id: id, content: result });
      }

      continue;
    }

    const content = choice.content?.trim();
    if (!content) {
      throw new ServiceError("INTERNAL", "OpenAI returned an empty response.");
    }

    transcript.push({ role: "assistant", content });
    return { content, messages: transcript };
  }

  throw new ServiceError(
    "INTERNAL",
    "I ran out of steps before completing your request. Try breaking it into smaller tasks.",
  );
}

async function fetchOpenAiChoice(
  transcript: OpenAiConversationMessage[],
  tools: OpenAiToolDefinition[],
  signal: AbortSignal,
  onToken?: (delta: string) => void,
): Promise<{ content?: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ServiceError("PRECONDITION_FAILED", "OpenAI is not configured.");
  const useStream = Boolean(onToken);

  const label = useStream ? "openai.chat.tools.stream" : "openai.chat.tools";
  const response = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        messages: transcript,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
        stream: useStream,
      }),
      signal,
    },
    label,
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ServiceError(
      "INTERNAL",
      payload.error?.message?.trim() || "OpenAI request failed. Try again shortly.",
    );
  }

  if (!useStream || !response.body) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
    };
    const choice = payload.choices?.[0]?.message;
    if (!choice) {
      throw new ServiceError("INTERNAL", "OpenAI returned an empty response.");
    }
    return choice;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls = new Map<number, ToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") continue;

      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: "function";
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        parsed = JSON.parse(dataStr) as typeof parsed;
      } catch {
        continue;
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        onToken?.(delta.content);
      }

      for (const toolDelta of delta.tool_calls ?? []) {
        const existing = toolCalls.get(toolDelta.index) ?? {
          id: toolDelta.id ?? "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (toolDelta.id) existing.id = toolDelta.id;
        if (toolDelta.function?.name) existing.function.name = toolDelta.function.name;
        if (toolDelta.function?.arguments) {
          existing.function.arguments += toolDelta.function.arguments;
        }
        toolCalls.set(toolDelta.index, existing);
      }
    }
  }

  const tool_calls = toolCalls.size
    ? Array.from(toolCalls.entries())
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
    : undefined;

  return { content: content || null, tool_calls };
}
