import { describe, expect, it } from "vitest";

import { cosineSimilarity, computeLocalEmbedding, ensureEntryEmbedding } from "./agent-memory-embeddings";

describe("agent memory embeddings", () => {
  it("produces normalized vectors", () => {
    const vec = computeLocalEmbedding("OAuth login enterprise SSO");
    const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("scores similar text higher than unrelated text", () => {
    const oauth = computeLocalEmbedding("OAuth login for enterprise customers SSO discussion");
    const bulk = computeLocalEmbedding("Bulk export compliance CSV reports");
    const query = computeLocalEmbedding("remember our OAuth discussion");

    expect(cosineSimilarity(query, oauth)).toBeGreaterThan(cosineSimilarity(query, bulk));
  });

  it("lazily attaches embeddings to memory entries", () => {
    const entry = ensureEntryEmbedding({
      at: "2026-01-01T00:00:00.000Z",
      tool: "get_feature_request",
      summary: "OAuth login feature status",
    });
    expect(entry.embedding?.length).toBeGreaterThan(0);
  });
});
