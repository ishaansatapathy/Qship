import { describe, expect, it } from "vitest";

import { applyHistoryCompaction, buildCompactionAppendix } from "./agent-compaction";

describe("agent history compaction", () => {
  it("builds a compact appendix for older turns", () => {
    const appendix = buildCompactionAppendix([
      { role: "user", content: "Create a feature for CSV export" },
      { role: "assistant", content: "I created the feature request." },
    ]);
    expect(appendix).toContain("EARLIER CONVERSATION");
    expect(appendix).toContain("CSV export");
  });

  it("keeps recent turns and compacts older ones", () => {
    const history = Array.from({ length: 14 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn-${i}`,
    }));
    const { history: recent, compactionAppendix } = applyHistoryCompaction(history, false);
    expect(recent).toHaveLength(8);
    expect(compactionAppendix).toContain("turn-0");
    expect(compactionAppendix).toContain("turn-5");
  });
});
