import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { ensureShipflowAgentServices } from "@repo/services/ensure-agent-services";
import { getSettingsService } from "@repo/services/settings";
import { isLegacyUiStubsEnabled } from "@repo/services/runtime-env";

import { protectedProcedure, router } from "../../trpc";
import {
  emptyAgentSession,
  emptyDailyBrief,
  emptyMeetingPrep,
  emptyQueueItem,
  emptyQueueStats,
  emptyRankResult,
  emptyMailContext,
  type ConnectionState,
} from "./stub-fixtures";

/** Legacy dashboard UI expects rich shapes — use loose output typing for compat stubs. */
const out = z.any();

const connectionInput = z.object({}).passthrough();
const looseInput = z.object({}).passthrough();
const queueItemReturn = emptyQueueItem();

const noopQueueItem = async () => queueItemReturn;

/** Legacy Gmail/calendar stubs — disabled in production (404). */
const legacyProcedure = protectedProcedure.use(({ next }) => {
  if (!isLegacyUiStubsEnabled()) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Legacy endpoint is not available in this environment.",
    });
  }
  return next();
});

/** Keeps legacy dashboard pages alive without Gmail backend. */
export const inboxRouter = router({
  connectionStatus: legacyProcedure.input(connectionInput).output(out).query(() => ({
    gmail: "not_connected" as ConnectionState,
  })),

  listMail: legacyProcedure
    .input(
      z
        .object({
          maxResults: z.number().optional(),
          pageToken: z.string().optional(),
          query: z.string().optional(),
          refresh: z.boolean().optional(),
        })
        .passthrough(),
    )
    .output(out).query(() => ({
      items: [] as Array<Record<string, unknown>>,
      nextPageToken: undefined as string | undefined,
      stale: false,
    })),

  listCachedMail: legacyProcedure
    .input(z.object({ limit: z.number().optional(), query: z.string().optional() }).passthrough())
    .output(out).query(() => ({ items: [] as Array<Record<string, unknown>>, stale: false })),

  listDrafts: legacyProcedure
    .input(z.object({ maxResults: z.number().optional(), pageToken: z.string().optional() }).passthrough())
    .output(out).query(() => ({ drafts: [] as Array<Record<string, unknown>>, nextPageToken: undefined as string | undefined })),

  getMailItem: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).query(() => null),

  listLabels: legacyProcedure.input(connectionInput).output(out).query(() => ({ labels: [] as Array<Record<string, unknown>> })),

  searchMailDb: legacyProcedure
    .input(z.object({ query: z.string().optional(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ items: [] as Array<Record<string, unknown>> })),

  markMailRead: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  starMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  unstarMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  markImportant: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  markNotImportant: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  trashMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  muteMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  unmuteMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  archiveMail: legacyProcedure.input(z.object({ contextId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  applyLabel: legacyProcedure
    .input(z.object({ contextId: z.string(), labelId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
  removeLabel: legacyProcedure
    .input(z.object({ contextId: z.string(), labelId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
  createLabel: legacyProcedure.input(z.object({ name: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  disconnectGmail: legacyProcedure.input(connectionInput).output(out).mutation(noopQueueItem),

  batchModifyMail: legacyProcedure
    .input(z.object({ contextIds: z.array(z.string()) }).passthrough())
    .output(out)
    .mutation(noopQueueItem),

  getDraft: legacyProcedure
    .input(z.object({ draftId: z.string() }).passthrough())
    .output(out)
    .query(() => null),
});

export const calendarRouter = router({
  connectionStatus: legacyProcedure.input(connectionInput).output(out).query(() => ({
    googlecalendar: "not_connected" as ConnectionState,
  })),

  listEvents: legacyProcedure
    .input(
      z
        .object({
          timeMin: z.string().optional(),
          timeMax: z.string().optional(),
          maxResults: z.number().optional(),
          q: z.string().optional(),
        })
        .passthrough(),
    )
    .output(out).query(() => ({ events: [] as Array<Record<string, unknown>>, nextPageToken: undefined as string | undefined })),

  searchEventsDb: legacyProcedure
    .input(z.object({ query: z.string(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ events: [] as Array<Record<string, unknown>> })),

  checkFreeBusy: legacyProcedure.input(looseInput).output(out).mutation(() => ({
    busy: [] as Array<Record<string, unknown>>,
    conflicts: [] as Array<Record<string, unknown>>,
  })),

  respondToEvent: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),

  quickAddEvent: legacyProcedure.input(looseInput).output(out).mutation(() => ({ eventId: "demo-event" })),

  disconnectCalendar: legacyProcedure.input(connectionInput).output(out).mutation(noopQueueItem),
});

export const queueRouter = router({
  list: legacyProcedure
    .input(z.object({ status: z.enum(["pending", "all"]).optional() }).passthrough())
    .output(out).query(() => ({ items: [] as ReturnType<typeof emptyQueueItem>[] })),

  stats: legacyProcedure.input(connectionInput).output(out).query(() => emptyQueueStats),

  pendingCount: legacyProcedure.input(connectionInput).output(out).query(() => ({ count: 0 })),

  approve: legacyProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  dismiss: legacyProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),

  enqueueEmail: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),

  enqueueDraftSend: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueMeeting: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendar: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendarArchive: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendarDelete: legacyProcedure.input(looseInput).output(out).mutation(noopQueueItem),
});

export const settingsRouter = router({
  getApprovalDefaults: legacyProcedure.input(connectionInput).output(out).query(async ({ ctx }) => {
    ensureShipflowAgentServices();
    return getSettingsService().getApprovalDefaults(ctx.user.id);
  }),

  updateApprovalDefaults: legacyProcedure
    .input(
      z
        .object({
          autoApproveEmail: z.boolean().optional(),
          autoApproveAgentEmail: z.boolean().optional(),
          autoApproveCalendar: z.boolean().optional(),
        })
        .passthrough(),
    )
    .output(out)
    .mutation(async ({ ctx, input }) => {
      ensureShipflowAgentServices();
      const current = await getSettingsService().getApprovalDefaults(ctx.user.id);
      return getSettingsService().updateApprovalDefaults(ctx.user.id, {
        autoApproveEmail: input.autoApproveEmail ?? current.autoApproveEmail,
        autoApproveAgentEmail: input.autoApproveAgentEmail ?? current.autoApproveAgentEmail,
        autoApproveCalendar: input.autoApproveCalendar ?? current.autoApproveCalendar,
      });
    }),
});

export const aiRouter = router({
  status: legacyProcedure.input(connectionInput).output(out).query(() => ({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ready: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })),

  mailContext: legacyProcedure
    .input(z.object({ contextId: z.string().optional() }).passthrough())
    .output(out).query(() => emptyMailContext),

  contactIntel: legacyProcedure
    .input(z.object({ email: z.string().optional(), name: z.string().optional() }).passthrough())
    .output(out).query(() => null),

  meetingPrep: legacyProcedure
    .input(z.object({ eventId: z.string().optional(), timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => emptyMeetingPrep),

  rankInboxMail: legacyProcedure
    .input(z.object({ contextIds: z.array(z.string()).optional() }).passthrough())
    .output(out).mutation(() => emptyRankResult),

  smartReplies: legacyProcedure
    .input(z.object({ contextId: z.string() }).passthrough())
    .output(out).query(() => ({ replies: [] as string[] })),

  summarizeMail: legacyProcedure
    .input(z.object({ contextId: z.string() }).passthrough())
    .output(out).query(() => ({ summary: "" })),

  dailyBrief: legacyProcedure
    .input(z.object({ date: z.string().optional(), timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => emptyDailyBrief),

  missedFollowUps: legacyProcedure
    .input(z.object({ timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => [] as Array<Record<string, unknown>>),

  getBriefDismissals: legacyProcedure
    .input(connectionInput)
    .output(out).query(() => ({ dismissedFocusIds: [] as string[] })),

  dismissBriefFocus: legacyProcedure
    .input(z.object({ contextId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
});

export const agentRouter = router({
  status: legacyProcedure.input(connectionInput).output(out).query(() => ({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ready: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })),

  chat: legacyProcedure
    .input(z.object({ message: z.string(), sessionId: z.string().optional() }).passthrough())
    .output(out).mutation(() => ({
      reply: "",
      actions: [] as Array<{
        kind: string;
        label?: string;
        queueItemId?: string;
        contextId?: string;
        eventId?: string;
      }>,
    })),

  listSessions: legacyProcedure
    .input(z.object({ limit: z.number().optional() }).passthrough())
    .output(out).query(() => [] as Array<{
      id: string;
      title: string | null;
      focusContextLabel?: string | null;
      focusEventLabel?: string | null;
      updatedAt: string;
    }>),

  getSession: legacyProcedure
    .input(z.object({ id: z.string() }).passthrough())
    .output(out).query(() => emptyAgentSession),

  createSession: legacyProcedure
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
            })
            .optional(),
        })
        .passthrough(),
    )
    .output(out).mutation(({ input }) => ({
      id: crypto.randomUUID(),
      title: input.title ?? null,
      focus: input.focus ?? {},
    })),

  updateSession: legacyProcedure
    .input(
      z
        .object({
          id: z.string(),
          title: z.string().optional(),
          focus: z
            .object({
              contextId: z.string().optional(),
              eventId: z.string().optional(),
              contextLabel: z.string().optional(),
              eventLabel: z.string().optional(),
            })
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .output(out).mutation(() => emptyAgentSession),

  deleteSession: legacyProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
});

export const contactsRouter = router({
  syncFromInbox: legacyProcedure.input(connectionInput).output(out).mutation(noopQueueItem),
  syncInboxBatch: legacyProcedure.input(connectionInput).output(out).mutation(noopQueueItem),

  search: legacyProcedure
    .input(z.object({ query: z.string(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ contacts: [] as Array<Record<string, unknown>> })),
});

export const briefRouter = router({});

