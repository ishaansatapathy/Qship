/** Empty demo payloads so legacy dashboard UI type-checks without Gmail backend. */

export type ConnectionState = "connected" | "missing_credentials" | "not_connected" | "not_configured";

export const emptyDailyBrief = {
  greeting: "Good morning",
  summary: "Connect GitHub and submit feature requests to see your ShipFlow pipeline here.",
  todaysFocus: {
    headline: "Review open feature requests",
    detail: "ShipFlow tracks delivery from request → PRD → ship.",
    byTime: "Today",
    contextId: undefined as string | undefined,
    eventId: undefined as string | undefined,
  },
  needsAttention: [] as Array<{
    headline: string;
    detail?: string;
    urgency?: "high" | "medium" | "low";
    contextId?: string;
    eventId?: string;
    queueItemId?: string;
  }>,
  meetingInsights: [] as Array<{
    headline: string;
    detail?: string;
    urgency?: "high" | "medium" | "low";
    contextId?: string;
    eventId?: string;
    queueItemId?: string;
  }>,
  risks: [] as Array<{
    headline: string;
    detail?: string;
    urgency?: "high" | "medium" | "low";
    contextId?: string;
    eventId?: string;
    queueItemId?: string;
  }>,
  recommendedActions: [] as Array<{
    id: string;
    label: string;
    kind: "reply" | "prepare_meeting" | "follow_up" | "open_queue" | "open_inbox" | "agent";
    contextId?: string;
    eventId?: string;
    queueItemId?: string;
    agentPrompt?: string;
  }>,
  generatedAt: new Date().toISOString(),
  connections: { gmail: false, calendar: false },
  focusWindow: undefined as
    | { label: string; startIso: string; endIso: string }
    | undefined,
};

export const emptyQueueStats = {
  total: 0,
  pending: 0,
  approved: 0,
  dismissed: 0,
  failed: 0,
  byKind: {} as Record<string, number>,
  timeline: [] as Array<{ date: string; queued: number; approved: number }>,
};

export const emptyObservabilitySummary = {
  inboxCacheHits: 0,
  mcpToolCalls: 0,
};

export const emptyAgentSession = {
  id: "demo-session",
  title: null as string | null,
  messages: [] as Array<{ role: "user" | "assistant"; content: string }>,
  toolMemory: [] as Array<{
    at: string;
    tool: string;
    summary: string;
    contextId?: string;
    eventId?: string;
    query?: string;
  }>,
  focus: {
    contextId: undefined as string | undefined,
    eventId: undefined as string | undefined,
    contextLabel: undefined as string | undefined,
    eventLabel: undefined as string | undefined,
  },
  updatedAt: new Date().toISOString(),
};

export function emptyQueueItem(id = "demo-queue-item") {
  return {
    id,
    kind: "email_send",
    title: "Demo queue item",
    preview: "",
    payload: {} as Record<string, unknown>,
    status: "pending" as const,
    sourceFocusId: undefined as string | undefined,
    createdAt: new Date().toISOString(),
    resolvedAt: null as string | null,
    errorMessage: null as string | null,
  };
}

export const emptyMailContext = {
  summary: "",
  bullets: [] as string[],
  whyMatters: "No mail context in ShipFlow demo mode.",
  nextAction: "Open Requests or submit a new feature request.",
  isFollowUpNeeded: false,
  followUpSuggestion: undefined as string | undefined,
  senderInfo: undefined as { email?: string; name?: string } | undefined,
};

export const emptyMeetingPrep = {
  summary: "No meeting linked",
  prepNote: "Connect calendar or pick an event to see prep notes.",
  attendeeNames: [] as string[],
  agenda: "No agenda provided.",
  talkingPoints: [] as string[],
  risks: [] as string[],
  relatedMail: [] as Array<{ id: string; subject: string; snippet: string }>,
};

export const emptyRankResult = {
  rankedIds: [] as string[],
  items: [] as Array<{
    id: string;
    urgency: "high" | "medium" | "low" | "noise";
    reason: string;
  }>,
  summary: "No inbox items to rank in ShipFlow demo mode.",
};
