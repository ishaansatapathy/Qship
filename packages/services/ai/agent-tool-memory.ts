export type AgentToolMemoryEntry = {
  at: string;
  tool: string;
  summary: string;
  contextId?: string;
  eventId?: string;
  query?: string;
  /** Local semantic vector for hybrid retrieval (optional, computed lazily). */
  embedding?: number[];
};

export const MAX_TOOL_MEMORY_ENTRIES = 12;

const MEMORY_TOOLS = new Set([
  "list_feature_requests",
  "get_feature_request",
  "get_pipeline_summary",
  "create_feature_request",
  "generate_feature_prd",
  "generate_feature_tasks",
  "run_ai_review",
  "list_github_repositories",
]);

export function shouldRememberTool(toolName: string): boolean {
  return MEMORY_TOOLS.has(toolName);
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function summarizeToolResult(
  toolName: string,
  rawResult: string,
  args: Record<string, unknown>,
): AgentToolMemoryEntry | null {
  if (!shouldRememberTool(toolName)) return null;

  const at = new Date().toISOString();
  const data = safeParseJson(rawResult);
  const eventId = typeof args.eventId === "string" ? args.eventId.trim() : undefined;
  const featureId = typeof args.id === "string" ? args.id.trim() : undefined;

  switch (toolName) {
    case "list_feature_requests": {
      const count = typeof data?.count === "number" ? data.count : undefined;
      const requests = Array.isArray(data?.requests) ? data.requests : [];
      const top = requests
        .slice(0, 3)
        .map((r) => {
          if (!r || typeof r !== "object") return "";
          const row = r as Record<string, unknown>;
          const title = typeof row.title === "string" ? row.title : "";
          const status = typeof row.status === "string" ? row.status : "";
          return title ? `${title} (${status})` : "";
        })
        .filter(Boolean);
      return {
        at,
        tool: toolName,
        summary: clip(`Listed ${count ?? requests.length} feature request(s)${top.length ? `: ${top.join("; ")}` : ""}`),
      };
    }

    case "get_feature_request": {
      const title = typeof data?.title === "string" ? data.title : "Feature request";
      const status = typeof data?.status === "string" ? data.status : "";
      return {
        at,
        tool: toolName,
        summary: clip(`Read "${title}"${status ? ` — ${status}` : ""}`),
        query: featureId,
      };
    }

    case "get_pipeline_summary": {
      const total = typeof data?.total === "number" ? data.total : 0;
      const needs = typeof data?.needsAttention === "number" ? data.needsAttention : 0;
      return {
        at,
        tool: toolName,
        summary: clip(`Pipeline: ${total} total, ${needs} need attention`),
      };
    }

    case "create_feature_request": {
      const title = typeof data?.title === "string" ? data.title : "New request";
      return { at, tool: toolName, summary: clip(`Created feature request "${title}"`) };
    }

    case "generate_feature_prd": {
      return {
        at,
        tool: toolName,
        summary: clip(`Generated PRD for feature ${featureId ?? ""}`.trim()),
        query: featureId,
      };
    }

    case "generate_feature_tasks": {
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      return {
        at,
        tool: toolName,
        summary: clip(`Created ${tasks.length} engineering task(s)${featureId ? ` for ${featureId}` : ""}`),
        query: featureId,
      };
    }

    case "run_ai_review": {
      const pass = data?.review && typeof data.review === "object" ? (data.review as Record<string, unknown>).pass : undefined;
      return {
        at,
        tool: toolName,
        summary: clip(`AI review ${pass === true ? "passed" : pass === false ? "needs fixes" : "completed"}`),
        query: featureId,
      };
    }

    case "list_github_repositories": {
      const count = typeof data?.count === "number" ? data.count : 0;
      return { at, tool: toolName, summary: clip(`Found ${count} linked GitHub repo(s)`) };
    }

    default:
      return { at, tool: toolName, summary: clip(`${toolName} completed`) };
  }
}

export function appendToolMemory(
  existing: AgentToolMemoryEntry[],
  entry: AgentToolMemoryEntry,
): AgentToolMemoryEntry[] {
  return [...existing, entry].slice(-MAX_TOOL_MEMORY_ENTRIES);
}

export function mergeToolMemory(
  existing: AgentToolMemoryEntry[],
  newEntries: AgentToolMemoryEntry[],
): AgentToolMemoryEntry[] {
  if (newEntries.length === 0) return existing;
  return [...existing, ...newEntries].slice(-MAX_TOOL_MEMORY_ENTRIES);
}

export function formatToolMemoryForPrompt(entries: AgentToolMemoryEntry[]): string {
  if (!entries.length) return "";

  const lines = entries.map((e) => {
    const parts = [`- [${e.tool}] ${e.summary}`];
    if (e.contextId) parts.push(`contextId=${e.contextId}`);
    if (e.eventId) parts.push(`eventId=${e.eventId}`);
    if (e.query) parts.push(`query="${e.query}"`);
    return parts.join(" ");
  });

  return [
    "",
    "═══ RECENT TOOL RESULTS (structured memory — prefer over stale chat topics) ═══",
    ...lines,
    "When the user asks follow-up questions without naming a new subject, use these results before re-searching.",
  ].join("\n");
}
