import type { AgentHistoryMessage } from "./agent";

const DEFAULT_RECENT_LIMIT = 8;
const FOCUS_RECENT_LIMIT = 4;

function clip(text: string, max = 140): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

export function buildCompactionAppendix(compacted: AgentHistoryMessage[]): string {
  if (compacted.length === 0) return "";

  const lines = compacted.map((msg) => {
    const prefix = msg.role === "user" ? "User" : "Assistant";
    return `- ${prefix}: ${clip(msg.content)}`;
  });

  return [
    "",
    "═══ EARLIER CONVERSATION (compacted — use for context, prefer recent turns) ═══",
    ...lines,
  ].join("\n");
}

export function applyHistoryCompaction(
  history: AgentHistoryMessage[] | undefined,
  focused: boolean,
): { history: AgentHistoryMessage[]; compactionAppendix: string } {
  const all = history ?? [];
  const recentLimit = focused ? FOCUS_RECENT_LIMIT : DEFAULT_RECENT_LIMIT;

  if (all.length <= recentLimit) {
    return { history: all, compactionAppendix: "" };
  }

  const compacted = all.slice(0, -recentLimit);
  const recent = all.slice(-recentLimit);
  return {
    history: recent,
    compactionAppendix: buildCompactionAppendix(compacted),
  };
}
