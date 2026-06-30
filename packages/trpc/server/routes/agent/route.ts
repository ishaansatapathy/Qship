import { z, zodUndefinedModel } from "../../schema";

import { isAgentConfigured, runAgentChat } from "@repo/services/ai/agent";
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSession,
  listAgentSessions,
  updateAgentSession,
} from "@repo/services/ai/agent-sessions";
import { isOpenAiConfigured } from "@repo/services/ai/openai";
import { AGENT_USER_RATE_LIMIT } from "@repo/services/cache/agent-rate-limits";
import { checkDistributedRateLimit } from "@repo/services/cache/rate-limit";
import { TRPCError } from "@trpc/server";
import { agentStatusOutput } from "../../openapi-outputs";

import { mapServiceError, protectedProcedure, mutationProcedure, router } from "../../trpc";

export const agentRouter = router({
  status: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/agent/status",
        tags: ["Agent"],
        protect: true,
        summary: "AI agent configuration status (OpenAI key, model)",
      },
    })
    .input(zodUndefinedModel)
    .output(agentStatusOutput).query(() => ({
    configured: isOpenAiConfigured(),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ready: isAgentConfigured(),
  })),

  chat: mutationProcedure
    .input(
      z.object({
        message: z.string().min(1).max(4000),
        sessionId: z.string().uuid().optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional(),
        toolMemory: z
          .array(
            z.object({
              at: z.string(),
              tool: z.string(),
              summary: z.string(),
              contextId: z.string().optional(),
              eventId: z.string().optional(),
              query: z.string().optional(),
            }),
          )
          .optional(),
        userEmail: z.string().email().optional(),
        focusContextId: z.string().optional(),
        focusEventId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (process.env.VITEST !== "true") {
          const rateLimit = await checkDistributedRateLimit(
            `agent:${ctx.user.id}`,
            AGENT_USER_RATE_LIMIT.limit,
            AGENT_USER_RATE_LIMIT.windowMs,
          );
          if (!rateLimit.allowed) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Agent rate limit exceeded. Please retry shortly.",
            });
          }
        }

        let history = input.history;
        let toolMemory = input.toolMemory;
        let focus = {
          contextId: input.focusContextId,
          eventId: input.focusEventId,
        };

        if (input.sessionId) {
          const session = await getAgentSession(ctx.user.id, input.sessionId);
          if (!session) {
            throw new Error("Session not found");
          }
          history = session.messages;
          toolMemory = session.toolMemory;
          if (!input.focusContextId && !input.focusEventId) {
            focus = {
              contextId: session.focus.contextId,
              eventId: session.focus.eventId,
            };
          }
        }

        const result = await runAgentChat(ctx.user.id, {
          message: input.message,
          history,
          toolMemory,
          userEmail: input.userEmail ?? ctx.user.email,
          focus,
        });

        if (input.sessionId) {
          await updateAgentSession(ctx.user.id, input.sessionId, {
            messages: [
              ...(history ?? []),
              { role: "user", content: input.message },
              { role: "assistant", content: result.reply },
            ],
            toolMemory: result.toolMemory ?? toolMemory,
          });
        }

        return {
          reply: result.reply,
          actions: result.actions,
          toolMemory: result.toolMemory,
          focusCleared: result.focusCleared,
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const rows = await listAgentSessions(ctx.user.id, input?.limit ?? 30);
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          messageCount: row.messageCount,
          focusContextLabel: row.focusContextLabel,
          focusEventLabel: row.focusEventLabel,
          updatedAt: row.updatedAt.toISOString(),
        }));
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getSession: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const session = await getAgentSession(ctx.user.id, input.id);
        if (!session) return null;
        return {
          id: session.id,
          title: session.title,
          messages: session.messages,
          toolMemory: session.toolMemory,
          focus: session.focus,
          updatedAt: session.updatedAt.toISOString(),
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  createSession: mutationProcedure
    .input(
      z
        .object({
          title: z.string().nullable().optional(),
          focus: z
            .object({
              contextId: z.string().optional(),
              eventId: z.string().optional(),
              contextLabel: z.string().optional(),
              eventLabel: z.string().optional(),
              walkthroughTaskId: z.string().uuid().optional(),
              analyzeRepo: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await createAgentSession(ctx.user.id, {
          title: input?.title,
          focus: input?.focus,
        });
        return {
          id: session.id,
          title: session.title,
          focus: session.focus,
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateSession: mutationProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().optional(),
        focus: z
          .object({
            contextId: z.string().optional(),
            eventId: z.string().optional(),
            contextLabel: z.string().optional(),
            eventLabel: z.string().optional(),
            walkthroughTaskId: z.string().uuid().optional(),
            analyzeRepo: z.boolean().optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await updateAgentSession(ctx.user.id, input.id, {
          title: input.title,
          focus: input.focus,
        });
        if (!session) return null;
        return {
          id: session.id,
          title: session.title,
          messages: session.messages,
          toolMemory: session.toolMemory,
          focus: session.focus,
          updatedAt: session.updatedAt.toISOString(),
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  deleteSession: mutationProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const deleted = await deleteAgentSession(ctx.user.id, input.id);
        return { deleted };
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
