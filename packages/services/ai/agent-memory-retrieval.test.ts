import { describe, expect, it } from "vitest";

import type { AgentToolMemoryEntry } from "./agent-tool-memory";
import {
  retrieveRelevantToolMemory,
  scoreToolMemoryEntry,
  tokenizeForMemoryRetrieval,
} from "./agent-memory-retrieval";

const entries: AgentToolMemoryEntry[] = [
  {
    at: "2026-01-01T00:00:00.000Z",
    tool: "list_feature_requests",
    summary: "Listed 3 feature request(s): OAuth login (prd_ready); Bulk export (human_review)",
  },
  {
    at: "2026-01-01T00:01:00.000Z",
    tool: "get_pipeline_summary",
    summary: "Pipeline: 8 total, 2 need attention",
  },
  {
    at: "2026-01-01T00:02:00.000Z",
    tool: "get_feature_request",
    summary: 'Read "Bulk export for compliance" — human_review',
    query: "feat-export-1",
  },
];

describe("agent memory retrieval", () => {
  it("tokenizes user follow-up queries", () => {
    expect(tokenizeForMemoryRetrieval("What is the status of bulk export?")).toContain("bulk");
    expect(tokenizeForMemoryRetrieval("What is the status of bulk export?")).toContain("export");
  });

  it("scores entries that match query tokens", () => {
    const tokens = tokenizeForMemoryRetrieval("bulk export status");
    expect(scoreToolMemoryEntry(entries[2]!, tokens)).toBeGreaterThan(0);
    expect(scoreToolMemoryEntry(entries[1]!, tokens)).toBe(0);
  });

  it("returns matching historical entries even when they are not in the last 4", () => {
    const longHistory: AgentToolMemoryEntry[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        at: `2026-01-01T00:0${i}:00.000Z`,
        tool: "get_workspace",
        summary: `Workspace snapshot ${i}`,
      })),
      entries[2]!,
    ];

    const retrieved = retrieveRelevantToolMemory("tell me about bulk export", longHistory);
    expect(retrieved.some((entry) => entry.query === "feat-export-1")).toBe(true);
  });

  it("uses semantic similarity for paraphrased follow-ups without exact keywords", () => {
    const oauthEntry: AgentToolMemoryEntry = {
      at: "2026-01-01T00:03:00.000Z",
      tool: "get_feature_request",
      summary: 'Read "OAuth login for enterprise customers" — prd_ready with SSO discussion',
    };
    const noise: AgentToolMemoryEntry[] = Array.from({ length: 8 }, (_, i) => ({
      at: `2026-01-02T00:0${i}:00.000Z`,
      tool: "get_workspace",
      summary: `Workspace snapshot ${i}`,
    }));

    const retrieved = retrieveRelevantToolMemory(
      "remember our OAuth discussion from earlier?",
      [...noise, oauthEntry],
    );
    expect(retrieved.some((entry) => entry.summary.includes("OAuth login"))).toBe(true);
  });
});
