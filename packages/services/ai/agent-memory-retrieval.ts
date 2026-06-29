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
  "request",
]);

/** Lightweight stem: oauth → oauth, exporting → export */
function stemToken(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 4) return word.slice(0, -1);
  return word;
}

export function tokenizeForMemoryRetrieval(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const expanded = new Set<string>();
  for (const word of raw) {
    expanded.add(word);
    expanded.add(stemToken(word));
  }
  return Array.from(expanded);
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
  let score = 0;
  for (const token of queryTokens) {
    if (blob.includes(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }
  // Boost when feature id or context id appears in user query
  if (entry.contextId && queryTokens.some((t) => entry.contextId!.toLowerCase().includes(t))) {
    score += 3;
  }
  return score;
}

/**
 * Structured tool memory retrieval: keyword overlap + stemming + recency bias.
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
    .map((entry, index) => ({
      entry,
      score: scoreToolMemoryEntry(entry, queryTokens) + index / entries.length,
    }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || b.entry.at.localeCompare(a.entry.at));

  const merged = new Map<string, AgentToolMemoryEntry>();
  for (const entry of recent) {
    merged.set(`${entry.at}:${entry.tool}`, entry);
  }
  for (const { entry } of ranked.slice(0, 8)) {
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
