export type InboxConnectionState =
  | "connected"
  | "missing_credentials"
  | "not_connected"
  | "not_configured";

export type InboxConnectionStatus = {
  gmail: InboxConnectionState;
};

export type InboxConversation = {
  id: string;
  snippet: string;
  subject?: string;
  from?: string;
  fromName?: string;
  date?: string;
  unread?: boolean;
  labelIds?: string[];
};

export type ListMailOptions = {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  refresh?: boolean;
};

export const INBOX_PAGE_SIZE = 15;

export type ListMailResult = {
  items: InboxConversation[];
  nextPageToken?: string;
  stale?: boolean;
};

export interface InboxService {
  isConfigured(): boolean;
  getConnectionStatus(tenantId: string): Promise<InboxConnectionStatus>;
  listMail(tenantId: string, opts?: ListMailOptions): Promise<ListMailResult>;
  listCachedMail(
    tenantId: string,
    opts?: { limit?: number; query?: string },
  ): Promise<{ items: InboxConversation[] }>;
  getMailItem(
    tenantId: string,
    contextId: string,
    opts?: { userEmail?: string },
  ): Promise<InboxConversation | null>;
}

let inboxService: InboxService | null = null;

export function registerInboxService(service: InboxService) {
  inboxService = service;
}

export function tryGetInboxService(): InboxService | null {
  return inboxService;
}

export function getInboxService(): InboxService {
  if (!inboxService) {
    throw new Error("InboxService not registered");
  }
  return inboxService;
}
