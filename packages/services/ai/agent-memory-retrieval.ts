import type { AgentToolMemoryEntry } from "./agent-tool-memory";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "this",
  "that",
  "with",
  "from",
  "what",
  "when",
  "where",
  "show",
  "list",
  "get",
  "about",
  "please",
  "feature",
  "request",
]);

export function tokenizeForMemoryRetrieval(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function memoryEntryBlob(entry: AgentToolMemoryEntry): string {
  return [entry.tool, entry.summary, entry.query, entry.contextId, entry.eventId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function scoreToolMemoryEntry(entry: AgentToolMemoryEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const blob = memoryEntryBlob(entry);
  return queryTokens.reduce((score, token) => (blob.includes(token) ? score + 1 : score), 0);
}

/**
 * Lightweight retrieval over structured tool memory (keyword overlap + recency).
 * Avoids re-calling tools when the user asks follow-ups about prior results.
 */
export function retrieveRelevantToolMemory(
  userMessage: string,
  entries: AgentToolMemoryEntry[],
  opts?: { maxEntries?: number; minScore?: number },
): AgentToolMemoryEntry[] {
  const maxEntries = opts?.maxEntries ?? 12;
  if (entries.length === 0) return [];

  const recent = entries.slice(-4);
  const queryTokens = tokenizeForMemoryRetrieval(userMessage);
  if (queryTokens.length === 0) {
    return entries.slice(-maxEntries);
  }

  const minScore = opts?.minScore ?? 1;
  const ranked = entries
    .map((entry) => ({ entry, score: scoreToolMemoryEntry(entry, queryTokens) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || b.entry.at.localeCompare(a.entry.at));

  const merged = new Map<string, AgentToolMemoryEntry>();
  for (const entry of recent) {
    merged.set(`${entry.at}:${entry.tool}`, entry);
  }
  for (const { entry } of ranked.slice(0, 6)) {
    merged.set(`${entry.at}:${entry.tool}`, entry);
  }

  return Array.from(merged.values())
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-maxEntries);
}

export function formatRetrievedMemoryForPrompt(
  userMessage: string,
  entries: AgentToolMemoryEntry[],
): AgentToolMemoryEntry[] {
  return retrieveRelevantToolMemory(userMessage, entries);
}
