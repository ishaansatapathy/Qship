import type { AgentToolMemoryEntry } from "./agent-tool-memory";

const EMBEDDING_DIMS = 128;

function memoryText(entry: AgentToolMemoryEntry): string {
  return [entry.tool, entry.summary, entry.query, entry.contextId, entry.eventId].filter(Boolean).join(" ");
}

/** Deterministic local embedding — no API key required; hybrid with keyword retrieval in CI. */
export function computeLocalEmbedding(text: string, dims = EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const normalized = text.toLowerCase();

  for (const token of normalized.split(/[^a-z0-9]+/).filter((t) => t.length > 2)) {
    for (let i = 0; i < token.length - 1; i++) {
      const gram = token.slice(i, i + 2);
      let hash = 0;
      for (let c = 0; c < gram.length; c++) {
        hash = (hash * 31 + gram.charCodeAt(c)) >>> 0;
      }
      vec[hash % dims]! += 1;
    }
  }

  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vec.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

export function ensureEntryEmbedding(entry: AgentToolMemoryEntry): AgentToolMemoryEntry {
  if (entry.embedding?.length) return entry;
  return {
    ...entry,
    embedding: computeLocalEmbedding(memoryText(entry)),
  };
}

export function scoreSemanticMemoryEntry(
  entry: AgentToolMemoryEntry,
  queryEmbedding: number[],
): number {
  const embedded = ensureEntryEmbedding(entry);
  const similarity = cosineSimilarity(queryEmbedding, embedded.embedding ?? []);
  return similarity > 0.35 ? similarity * 5 : 0;
}

export function embedQueryForMemoryRetrieval(userMessage: string): number[] {
  return computeLocalEmbedding(userMessage);
}
