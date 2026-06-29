import { describe, expect, it } from "vitest";

import { trimAgentHistory } from "./agent-run";

describe("trimAgentHistory", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: "user" as const,
    content: `message-${i}`,
  }));

  it("keeps last 8 messages without focus", () => {
    const trimmed = trimAgentHistory(history, undefined);
    expect(trimmed).toHaveLength(8);
    expect(trimmed[0]?.content).toBe("message-12");
  });

  it("keeps last 4 messages when feature focus is active", () => {
    const trimmed = trimAgentHistory(history, { contextId: "feature:abc" });
    expect(trimmed).toHaveLength(4);
    expect(trimmed[0]?.content).toBe("message-16");
  });

  it("keeps last 4 messages when walkthrough focus is active", () => {
    const trimmed = trimAgentHistory(history, { walkthroughTaskId: "task-1" });
    expect(trimmed).toHaveLength(4);
  });
});
