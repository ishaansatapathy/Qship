import { z } from "zod";

import { protectedProcedure, router } from "../../trpc";
import {
  emptyAgentSession,
  emptyDailyBrief,
  emptyMeetingPrep,
  emptyObservabilitySummary,
  emptyQueueItem,
  emptyQueueStats,
  emptyRankResult,
  emptyThreadContext,
  type ConnectionState,
} from "./stub-fixtures";

/** Legacy Thread UI expects rich shapes — use loose output typing for compat stubs. */
const out = z.any();

const connectionInput = z.object({}).passthrough();
const looseInput = z.object({}).passthrough();
const queueItemReturn = emptyQueueItem();

const noopQueueItem = async () => queueItemReturn;

/** Keeps legacy dashboard pages alive without Gmail/Thread backend. */
export const inboxRouter = router({
  connectionStatus: protectedProcedure.input(connectionInput).output(out).query(() => ({
    gmail: "not_connected" as ConnectionState,
  })),

  listThreads: protectedProcedure
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
      threads: [] as Array<Record<string, unknown>>,
      nextPageToken: undefined as string | undefined,
      stale: false,
    })),

  listCachedThreads: protectedProcedure
    .input(z.object({ limit: z.number().optional(), query: z.string().optional() }).passthrough())
    .output(out).query(() => ({ threads: [] as Array<Record<string, unknown>>, stale: false })),

  listDrafts: protectedProcedure
    .input(z.object({ maxResults: z.number().optional(), pageToken: z.string().optional() }).passthrough())
    .output(out).query(() => ({ drafts: [] as Array<Record<string, unknown>>, nextPageToken: undefined as string | undefined })),

  getThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).query(() => null),

  listLabels: protectedProcedure.input(connectionInput).output(out).query(() => ({ labels: [] as Array<Record<string, unknown>> })),

  searchThreadsDb: protectedProcedure
    .input(z.object({ query: z.string().optional(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ threads: [] as Array<Record<string, unknown>> })),

  markThreadRead: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  starThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  unstarThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  markImportant: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  markNotImportant: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  trashThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  muteThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  unmuteThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  archiveThread: protectedProcedure.input(z.object({ threadId: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  applyLabel: protectedProcedure
    .input(z.object({ threadId: z.string(), labelId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
  removeLabel: protectedProcedure
    .input(z.object({ threadId: z.string(), labelId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
  createLabel: protectedProcedure.input(z.object({ name: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  disconnectGmail: protectedProcedure.input(connectionInput).output(out).mutation(noopQueueItem),

  batchModifyThreads: protectedProcedure
    .input(z.object({ threadIds: z.array(z.string()) }).passthrough())
    .output(out)
    .mutation(noopQueueItem),

  getDraft: protectedProcedure
    .input(z.object({ draftId: z.string() }).passthrough())
    .output(out)
    .query(() => null),
});

export const calendarRouter = router({
  connectionStatus: protectedProcedure.input(connectionInput).output(out).query(() => ({
    googlecalendar: "not_connected" as ConnectionState,
  })),

  listEvents: protectedProcedure
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

  searchEventsDb: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ events: [] as Array<Record<string, unknown>> })),

  checkFreeBusy: protectedProcedure.input(looseInput).output(out).mutation(() => ({
    busy: [] as Array<Record<string, unknown>>,
    conflicts: [] as Array<Record<string, unknown>>,
  })),

  respondToEvent: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),

  quickAddEvent: protectedProcedure.input(looseInput).output(out).mutation(() => ({ eventId: "demo-event" })),

  disconnectCalendar: protectedProcedure.input(connectionInput).output(out).mutation(noopQueueItem),
});

export const queueRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "all"]).optional() }).passthrough())
    .output(out).query(() => ({ items: [] as ReturnType<typeof emptyQueueItem>[] })),

  stats: protectedProcedure.input(connectionInput).output(out).query(() => emptyQueueStats),

  pendingCount: protectedProcedure.input(connectionInput).output(out).query(() => ({ count: 0 })),

  approve: protectedProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
  dismiss: protectedProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),

  enqueueEmail: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),

  enqueueDraftSend: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueMeeting: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendar: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendarArchive: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),
  enqueueCalendarDelete: protectedProcedure.input(looseInput).output(out).mutation(noopQueueItem),
});

export const settingsRouter = router({
  getApprovalDefaults: protectedProcedure.input(connectionInput).output(out).query(() => ({
    autoApproveEmail: false,
    autoApproveAgentEmail: false,
    autoApproveCalendar: false,
  })),

  updateApprovalDefaults: protectedProcedure
    .input(
      z
        .object({
          autoApproveEmail: z.boolean().optional(),
          autoApproveAgentEmail: z.boolean().optional(),
          autoApproveCalendar: z.boolean().optional(),
        })
        .passthrough(),
    )
    .output(out).mutation(({ input }) => ({
      autoApproveEmail: input.autoApproveEmail ?? false,
      autoApproveAgentEmail: input.autoApproveAgentEmail ?? false,
      autoApproveCalendar: input.autoApproveCalendar ?? false,
    })),
});

export const aiRouter = router({
  status: protectedProcedure.input(connectionInput).output(out).query(() => ({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ready: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })),

  threadContext: protectedProcedure
    .input(z.object({ threadId: z.string().optional() }).passthrough())
    .output(out).query(() => emptyThreadContext),

  contactIntel: protectedProcedure
    .input(z.object({ email: z.string().optional(), name: z.string().optional() }).passthrough())
    .output(out).query(() => null),

  meetingPrep: protectedProcedure
    .input(z.object({ eventId: z.string().optional(), timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => emptyMeetingPrep),

  rankInboxThreads: protectedProcedure
    .input(z.object({ threadIds: z.array(z.string()).optional() }).passthrough())
    .output(out).mutation(() => emptyRankResult),

  smartReplies: protectedProcedure
    .input(z.object({ threadId: z.string() }).passthrough())
    .output(out).query(() => ({ replies: [] as string[] })),

  summarizeThread: protectedProcedure
    .input(z.object({ threadId: z.string() }).passthrough())
    .output(out).query(() => ({ summary: "" })),

  dailyBrief: protectedProcedure
    .input(z.object({ date: z.string().optional(), timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => emptyDailyBrief),

  missedFollowUps: protectedProcedure
    .input(z.object({ timeZone: z.string().optional() }).passthrough())
    .output(out).query(() => [] as Array<Record<string, unknown>>),

  getBriefDismissals: protectedProcedure
    .input(connectionInput)
    .output(out).query(() => ({ dismissedThreadIds: [] as string[] })),

  dismissBriefThread: protectedProcedure
    .input(z.object({ threadId: z.string() }).passthrough())
    .output(out).mutation(noopQueueItem),
});

export const agentRouter = router({
  status: protectedProcedure.input(connectionInput).output(out).query(() => ({
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    ready: Boolean(process.env.OPENAI_API_KEY?.trim()),
  })),

  chat: protectedProcedure
    .input(z.object({ message: z.string(), sessionId: z.string().optional() }).passthrough())
    .output(out).mutation(() => ({
      reply: "",
      actions: [] as Array<{
        kind: string;
        label?: string;
        queueItemId?: string;
        threadId?: string;
        eventId?: string;
      }>,
    })),

  listSessions: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).passthrough())
    .output(out).query(() => [] as Array<{
      id: string;
      title: string | null;
      focusThreadLabel?: string | null;
      focusEventLabel?: string | null;
      updatedAt: string;
    }>),

  getSession: protectedProcedure
    .input(z.object({ id: z.string() }).passthrough())
    .output(out).query(() => emptyAgentSession),

  createSession: protectedProcedure
    .input(
      z
        .object({
          title: z.string().nullable().optional(),
          focus: z
            .object({
              threadId: z.string().optional(),
              eventId: z.string().optional(),
              threadLabel: z.string().optional(),
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

  updateSession: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          title: z.string().optional(),
          focus: z
            .object({
              threadId: z.string().optional(),
              eventId: z.string().optional(),
              threadLabel: z.string().optional(),
              eventLabel: z.string().optional(),
            })
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .output(out).mutation(() => emptyAgentSession),

  deleteSession: protectedProcedure.input(z.object({ id: z.string() }).passthrough()).output(out).mutation(noopQueueItem),
});

export const contactsRouter = router({
  syncFromInbox: protectedProcedure.input(connectionInput).output(out).mutation(noopQueueItem),
  syncInboxBatch: protectedProcedure.input(connectionInput).output(out).mutation(noopQueueItem),

  search: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().optional() }).passthrough())
    .output(out).query(() => ({ contacts: [] as Array<Record<string, unknown>> })),
});

export const briefRouter = router({});

export const observabilityRouter = router({
  summary: protectedProcedure.input(connectionInput).output(out).query(() => emptyObservabilitySummary),
});
