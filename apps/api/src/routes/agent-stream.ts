/**
 * Agent SSE streaming endpoint — POST /agent/stream
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "@repo/logger";
import { runAgentChatStream } from "@repo/services/ai/agent-stream";
import {
  appendAgentSessionTurn,
  getAgentSession,
} from "@repo/services/ai/agent-sessions";
import { checkDistributedRateLimit } from "@repo/services/cache/rate-limit";
import { AGENT_USER_RATE_LIMIT } from "@repo/services/cache/agent-rate-limits";
import { resolveSessionUser } from "@repo/trpc/server";

const toolMemoryEntrySchema = z.object({
  at: z.string(),
  tool: z.string(),
  summary: z.string(),
  contextId: z.string().optional(),
  eventId: z.string().optional(),
  query: z.string().optional(),
});

const agentStreamBodySchema = z.object({
  message: z.string().trim().min(1, "message is required").max(4000),
  sessionId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(24)
    .optional(),
  toolMemory: z.array(toolMemoryEntrySchema).max(12).optional(),
  userEmail: z.string().email().optional(),
  focusContextId: z.string().trim().min(1).max(128).optional(),
  focusEventId: z.string().trim().min(1).max(256).optional(),
  walkthroughTaskId: z.string().uuid().optional(),
  analyzeRepo: z.boolean().optional(),
  focusContextLabel: z.string().trim().min(1).max(200).optional(),
  focusEventLabel: z.string().trim().min(1).max(200).optional(),
  focusCleared: z.boolean().optional(),
});

export const agentStreamRouter = Router();

const skipInTests = () => process.env.VITEST === "true";

agentStreamRouter.post("/", async (req: Request, res: Response) => {
  const user = await resolveSessionUser(req, res);
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!skipInTests()) {
    const result = await checkDistributedRateLimit(
      `agent:${user.id}`,
      AGENT_USER_RATE_LIMIT.limit,
      AGENT_USER_RATE_LIMIT.windowMs,
    );
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      return res.status(429).json({
        error: "Too many agent messages this minute. Wait a moment and try again.",
      });
    }
  }

  const parsed = agentStreamBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const {
    message,
    sessionId,
    history,
    toolMemory,
    userEmail,
    focusContextId,
    focusEventId,
    walkthroughTaskId,
    analyzeRepo,
    focusContextLabel,
    focusEventLabel,
    focusCleared,
  } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const traceId = crypto.randomUUID();
  res.setHeader("x-trace-id", traceId);
  res.flushHeaders();

  const abortController = new AbortController();
  const onClientClose = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.on("close", onClientClose);

  function send(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }

  try {
    let effectiveHistory = history;
    let effectiveToolMemory = toolMemory ?? [];
    let effectiveFocus = {
      contextId: focusContextId,
      eventId: focusEventId,
      walkthroughTaskId,
      analyzeRepo,
    };
    let effectivecontextLabel = focusContextLabel;
    let effectiveEventLabel = focusEventLabel;

    if (sessionId) {
      const session = await getAgentSession(user.id, sessionId);
      if (!session) {
        send("error", { message: "Session not found" });
        return;
      }
      effectiveHistory = session.messages;
      effectiveToolMemory = session.toolMemory;
      if (focusCleared) {
        effectiveFocus = {
          contextId: undefined,
          eventId: undefined,
          walkthroughTaskId: undefined,
          analyzeRepo: undefined,
        };
        effectivecontextLabel = undefined;
        effectiveEventLabel = undefined;
      } else if (focusContextId || focusEventId || walkthroughTaskId) {
        effectiveFocus = {
          contextId: focusContextId,
          eventId: focusEventId,
          walkthroughTaskId,
          analyzeRepo,
        };
      } else {
        effectiveFocus = {
          contextId: session.focus.contextId,
          eventId: session.focus.eventId,
          walkthroughTaskId: walkthroughTaskId ?? session.focus.walkthroughTaskId,
          analyzeRepo: analyzeRepo ?? session.focus.analyzeRepo,
        };
        effectivecontextLabel = session.focus.contextLabel;
        effectiveEventLabel = session.focus.eventLabel;
      }
    }

    const result = await runAgentChatStream(
      user.id,
      {
        message: message.trim(),
        history: effectiveHistory,
        toolMemory: effectiveToolMemory,
        userEmail: userEmail ?? user.email,
        focus: effectiveFocus,
      },
      (toolName) => {
        send("status", { tool: toolName, label: toolStatusLabel(toolName) });
      },
      (delta) => {
        send("token", { text: delta });
      },
      { signal: abortController.signal, traceId },
    );

    const persistedSessionId = sessionId;

    const persistedWalkthroughTaskId =
      result.walkthroughTaskId !== undefined ?
        result.walkthroughTaskId ?? undefined
      : effectiveFocus.walkthroughTaskId;

    if (sessionId) {
      const updated = await appendAgentSessionTurn(user.id, sessionId, {
        userMessage: message.trim(),
        assistantReply: result.reply,
        toolMemory: result.toolMemory ?? effectiveToolMemory,
        focusCleared: result.focusCleared,
        focus: result.focusCleared
          ? null
          : {
              contextId: effectiveFocus.contextId,
              eventId: effectiveFocus.eventId,
              contextLabel: effectivecontextLabel,
              eventLabel: effectiveEventLabel,
              walkthroughTaskId: persistedWalkthroughTaskId,
              analyzeRepo: effectiveFocus.analyzeRepo,
            },
      });
      if (!updated) {
        logger.warn("agent.stream.session_persist_failed", { userId: user.id, sessionId });
      }
    }

    send("complete", {
      reply: result.reply,
      actions: result.actions,
      sessionId: persistedSessionId,
      focusCleared: result.focusCleared ?? false,
      effectiveFocus: result.effectiveFocus ?? effectiveFocus,
      toolMemory: result.toolMemory ?? effectiveToolMemory,
      walkthroughTaskId: persistedWalkthroughTaskId ?? null,
      traceId: result.traceId,
      traceSpans: result.traceSpans,
    });
  } catch (error) {
    if (abortController.signal.aborted) return;
    const errMessage = error instanceof Error ? error.message : "Agent encountered an error";
    logger.warn("agent.stream.error", { userId: user.id, error: errMessage });
    send("error", { message: errMessage });
  } finally {
    req.off("close", onClientClose);
    res.end();
  }
});

function toolStatusLabel(tool: string): string {
  const labels: Record<string, string> = {
    get_workspace: "Loading workspace…",
    list_feature_requests: "Fetching feature requests…",
    get_feature_request: "Reading feature request…",
    create_feature_request: "Submitting feature request…",
    triage_feature_request: "Running AI triage…",
    generate_feature_prd: "Generating PRD…",
    generate_feature_tasks: "Breaking PRD into tasks…",
    add_clarification: "Recording clarification…",
    run_ai_review: "Running AI review…",
    request_human_review: "Requesting human approval…",
    update_feature_status: "Updating status…",
    get_pipeline_summary: "Summarizing pipeline…",
    github_connection_status: "Checking GitHub…",
    list_github_repositories: "Listing repositories…",
    list_calendar_events: "Checking calendar…",
  };
  return labels[tool] ?? `Running ${tool}…`;
}
