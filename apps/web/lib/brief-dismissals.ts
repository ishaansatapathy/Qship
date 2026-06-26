const STORAGE_KEY = "qship_brief_dismissals_v1";

function readStore(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

/** Brief items the user acted on — hide from Needs attention until server syncs. */
export function getDismissedBriefFocusIds(): Set<string> {
  return new Set(Object.keys(readStore()));
}

export function dismissBriefFocus(focusId: string) {
  const id = focusId.trim();
  if (!id) return;
  const store = readStore();
  store[id] = Date.now();
  writeStore(store);
}

export function pruneBriefDismissals(stillActiveFocusIds: Set<string>) {
  const store = readStore();
  let changed = false;
  for (const id of Object.keys(store)) {
    if (!stillActiveFocusIds.has(id)) {
      delete store[id];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

function focusIdFromHref(href?: string): string | undefined {
  if (!href) return undefined;
  const match = href.match(/[?&]focus=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function dismissBriefFocusFromAgentActions(
  actions: Array<{ kind: string; href?: string; contextId?: string }>,
) {
  const ids = new Set<string>();
  for (const action of actions) {
    if (action.contextId) ids.add(action.contextId);
    const fromHref = focusIdFromHref(action.href);
    if (fromHref) ids.add(fromHref);
    if (action.kind === "email_queued" && action.contextId) ids.add(action.contextId);
  }
  for (const id of ids) dismissBriefFocus(id);
}

export function dismissBriefFocusFromQueueItem(item: {
  sourceFocusId?: string;
  payload?: Record<string, unknown>;
}) {
  if (item.sourceFocusId) {
    dismissBriefFocus(item.sourceFocusId);
    return;
  }
  if (item.payload && typeof item.payload === "object") {
    const focusId = item.payload.contextId;
    if (typeof focusId === "string" && focusId.trim()) dismissBriefFocus(focusId);
  }
}
