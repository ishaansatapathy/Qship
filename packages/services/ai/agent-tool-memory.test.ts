import { describe, expect, it } from "vitest";

import {
  summarizeToolResult,
  appendToolMemory,
  mergeToolMemory,
  formatToolMemoryForPrompt,
  shouldRememberTool,
  MAX_TOOL_MEMORY_ENTRIES,
  type AgentToolMemoryEntry,
} from "./agent-tool-memory";

// ── shouldRememberTool ────────────────────────────────────────────────────────

describe("shouldRememberTool", () => {
  it("returns true for memory-tracked tools", () => {
    expect(shouldRememberTool("list_feature_requests")).toBe(true);
    expect(shouldRememberTool("get_feature_request")).toBe(true);
    expect(shouldRememberTool("run_ai_review")).toBe(true);
    expect(shouldRememberTool("get_pipeline_summary")).toBe(true);
  });

  it("returns false for non-tracked tools", () => {
    expect(shouldRememberTool("approve_feature")).toBe(false);
    expect(shouldRememberTool("unknown_tool")).toBe(false);
    expect(shouldRememberTool("")).toBe(false);
  });
});

// ── summarizeToolResult ───────────────────────────────────────────────────────

describe("summarizeToolResult", () => {
  it("summarizes feature list results", () => {
    const entry = summarizeToolResult(
      "list_feature_requests",
      JSON.stringify({
        count: 2,
        requests: [
          { title: "Bulk export", status: "submitted" },
          { title: "Dark mode", status: "in_delivery" },
        ],
      }),
      {},
    );
    expect(entry?.summary).toContain("2 feature request");
    expect(entry?.tool).toBe("list_feature_requests");
    expect(entry?.at).toMatch(/^\d{4}-/);
  });

  it("summarizes feature reads with query id", () => {
    const entry = summarizeToolResult(
      "get_feature_request",
      JSON.stringify({ title: "Bulk export", status: "submitted" }),
      { id: "feat-abc" },
    );
    expect(entry?.query).toBe("feat-abc");
    expect(entry?.summary).toContain("Bulk export");
    expect(entry?.summary).toContain("submitted");
  });

  it("summarizes pipeline summary", () => {
    const entry = summarizeToolResult(
      "get_pipeline_summary",
      JSON.stringify({ total: 10, needsAttention: 3 }),
      {},
    );
    expect(entry?.summary).toContain("10 total");
    expect(entry?.summary).toContain("3 need attention");
  });

  it("summarizes AI review pass result", () => {
    const entry = summarizeToolResult(
      "run_ai_review",
      JSON.stringify({ review: { pass: true, summary: "All good" } }),
      { id: "feat-xyz" },
    );
    expect(entry?.summary).toContain("passed");
    expect(entry?.query).toBe("feat-xyz");
  });

  it("summarizes AI review fail result", () => {
    const entry = summarizeToolResult(
      "run_ai_review",
      JSON.stringify({ review: { pass: false, summary: "Issues found" } }),
      { id: "feat-xyz" },
    );
    expect(entry?.summary).toContain("needs fixes");
  });

  it("summarizes PRD generation", () => {
    const entry = summarizeToolResult("generate_feature_prd", JSON.stringify({}), { id: "feat-prd" });
    expect(entry?.summary).toContain("PRD");
    expect(entry?.query).toBe("feat-prd");
  });

  it("summarizes task generation with count", () => {
    const entry = summarizeToolResult(
      "generate_feature_tasks",
      JSON.stringify({ tasks: [{ title: "Task 1" }, { title: "Task 2" }] }),
      { id: "feat-t" },
    );
    expect(entry?.summary).toContain("2 engineering task");
  });

  it("returns null for non-tracked tools", () => {
    const entry = summarizeToolResult("approve_feature", JSON.stringify({}), {});
    expect(entry).toBeNull();
  });

  it("handles malformed JSON without throwing", () => {
    const entry = summarizeToolResult("get_pipeline_summary", "not-json", {});
    expect(entry).toBeDefined();
    expect(entry?.tool).toBe("get_pipeline_summary");
  });

  it("clips long summaries to 120 chars", () => {
    const longTitle = "A".repeat(200);
    const entry = summarizeToolResult(
      "get_feature_request",
      JSON.stringify({ title: longTitle, status: "submitted" }),
      {},
    );
    expect(entry?.summary.length).toBeLessThanOrEqual(121);
  });
});

// ── appendToolMemory ──────────────────────────────────────────────────────────

describe("appendToolMemory", () => {
  const makeEntry = (tool: string): AgentToolMemoryEntry => ({
    at: new Date().toISOString(),
    tool,
    summary: `${tool} completed`,
  });

  it("appends entry to existing list", () => {
    const result = appendToolMemory([makeEntry("a")], makeEntry("b"));
    expect(result).toHaveLength(2);
    expect(result[1]?.tool).toBe("b");
  });

  it("trims to MAX_TOOL_MEMORY_ENTRIES", () => {
    const existing = Array.from({ length: MAX_TOOL_MEMORY_ENTRIES }, (_, i) => makeEntry(`t${i}`));
    const result = appendToolMemory(existing, makeEntry("new"));
    expect(result).toHaveLength(MAX_TOOL_MEMORY_ENTRIES);
    expect(result[result.length - 1]?.tool).toBe("new");
  });

  it("preserves order newest-last", () => {
    const e1 = makeEntry("first");
    const e2 = makeEntry("second");
    const result = appendToolMemory([e1], e2);
    expect(result[0]?.tool).toBe("first");
    expect(result[1]?.tool).toBe("second");
  });
});

// ── mergeToolMemory ───────────────────────────────────────────────────────────

describe("mergeToolMemory", () => {
  const makeEntry = (tool: string): AgentToolMemoryEntry => ({
    at: new Date().toISOString(),
    tool,
    summary: `${tool} done`,
  });

  it("returns existing when newEntries is empty", () => {
    const existing = [makeEntry("a")];
    expect(mergeToolMemory(existing, [])).toBe(existing);
  });

  it("merges and caps at MAX", () => {
    const big = Array.from({ length: MAX_TOOL_MEMORY_ENTRIES }, (_, i) => makeEntry(`t${i}`));
    const result = mergeToolMemory(big, [makeEntry("extra")]);
    expect(result).toHaveLength(MAX_TOOL_MEMORY_ENTRIES);
  });
});

// ── formatToolMemoryForPrompt ─────────────────────────────────────────────────

describe("formatToolMemoryForPrompt", () => {
  it("returns empty string for empty list", () => {
    expect(formatToolMemoryForPrompt([])).toBe("");
  });

  it("includes tool name and summary in prompt", () => {
    const entry: AgentToolMemoryEntry = {
      at: new Date().toISOString(),
      tool: "list_feature_requests",
      summary: "Listed 5 feature requests",
      query: "feat-abc",
    };
    const result = formatToolMemoryForPrompt([entry]);
    expect(result).toContain("list_feature_requests");
    expect(result).toContain("Listed 5 feature requests");
    expect(result).toContain('query="feat-abc"');
    expect(result).toContain("RECENT TOOL RESULTS");
  });

  it("includes contextId and eventId when present", () => {
    const entry: AgentToolMemoryEntry = {
      at: new Date().toISOString(),
      tool: "get_calendar_event",
      summary: "Read calendar event",
      contextId: "ctx-1",
      eventId: "evt-2",
    };
    const result = formatToolMemoryForPrompt([entry]);
    expect(result).toContain("contextId=ctx-1");
    expect(result).toContain("eventId=evt-2");
  });
});
