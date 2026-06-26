/**
 * Registers no-op Gmail/Calendar/Queue stubs when Corsair integrations are absent.
 * Lets ShipFlow Agent + MCP run feature/GitHub tools without inbox backend.
 */

import { registerCalendarService, getCalendarService, type CalendarService } from "./calendar";
import { ServiceError } from "./errors";
import { registerInboxService, tryGetInboxService, type InboxService } from "./inbox";
import { registerQueueService, getQueueService, type QueueService } from "./queue";
import { registerSettingsService, getSettingsService, type SettingsService } from "./settings";

const GMAIL_MSG = "Gmail is not connected in ShipFlow. Use feature or GitHub tools instead.";
const CALENDAR_MSG = "Google Calendar is not connected in ShipFlow.";
const QUEUE_MSG = "Approval queue is not available without Gmail/Calendar integration.";

function notConnected(method: string) {
  return () => {
    throw new ServiceError("PRECONDITION_FAILED", method);
  };
}

function disconnectedInbox(): InboxService {
  return new Proxy({} as InboxService, {
    get(_target, prop) {
      if (prop === "isConfigured") return () => false;
      if (prop === "getConnectionStatus") return async () => ({ gmail: "not_connected" as const });
      if (prop === "listMail") return async () => ({ items: [] });
      if (prop === "listCachedMail") return async () => ({ items: [] });
      if (prop === "getMailItem") return async () => null;
      if (prop === "listDrafts") return async () => ({ drafts: [] });
      if (prop === "getDraft") return async () => null;
      if (prop === "listLabels") return async () => [];
      if (prop === "searchMailDb") return async () => ({ items: [] });
      if (prop === "searchMessagesDb") return async () => ({ messages: [] });
      if (prop === "searchDraftsDb") return async () => ({ drafts: [] });
      if (prop === "searchLabelsDb") return async () => ({ labels: [] });
      if (prop === "listMessages") return async () => ({ messages: [] });
      if (prop === "batchModifyMail") return async () => ({ modifiedMessages: 0 });
      return notConnected(GMAIL_MSG);
    },
  });
}

function disconnectedQueue(): QueueService {
  return new Proxy({} as QueueService, {
    get(_target, prop) {
      if (prop === "listItems") return async () => [];
      if (prop === "pendingCount") return async () => 0;
      if (prop === "getStats")
        return async () => ({
          total: 0,
          pending: 0,
          approved: 0,
          dismissed: 0,
          failed: 0,
          byKind: {},
          timeline: [],
        });
      return notConnected(QUEUE_MSG);
    },
  });
}

function disconnectedCalendar(): CalendarService {
  return new Proxy({} as CalendarService, {
    get(_target, prop) {
      if (prop === "isConfigured") return () => false;
      if (prop === "getConnectionStatus") return async () => ({ googlecalendar: "not_connected" as const });
      if (prop === "getEvent") return async () => null;
      if (prop === "listEvents") return async () => ({ events: [] });
      if (prop === "checkFreeBusy") return async () => ({ conflicts: [], unavailable: true });
      if (prop === "searchEventsDb") return async () => ({ events: [] });
      if (prop === "searchCalendarsDb") return async () => ({ calendars: [] });
      return notConnected(CALENDAR_MSG);
    },
  });
}

function defaultSettings(): SettingsService {
  const defaults = {
    autoApproveEmail: false,
    autoApproveAgentEmail: false,
    autoApproveCalendar: false,
  };
  return {
    getApprovalDefaults: async () => defaults,
    updateApprovalDefaults: async (_userId, input) => input,
  };
}

let ensured = false;

export function ensureShipflowAgentServices() {
  if (ensured) return;
  ensured = true;

  if (!tryGetInboxService()) registerInboxService(disconnectedInbox());

  try {
    getQueueService();
  } catch {
    registerQueueService(disconnectedQueue());
  }

  try {
    getCalendarService();
  } catch {
    registerCalendarService(disconnectedCalendar());
  }

  try {
    getSettingsService();
  } catch {
    registerSettingsService(defaultSettings());
  }
}
