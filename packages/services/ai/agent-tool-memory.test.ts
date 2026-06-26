import { describe, expect, it } from "vitest";

import { summarizeToolResult } from "./agent-tool-memory";

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
  });

  it("summarizes feature reads with query id", () => {
    const entry = summarizeToolResult(
      "get_feature_request",
      JSON.stringify({ title: "Bulk export", status: "submitted" }),
      { id: "feat-abc" },
    );
    expect(entry?.query).toBe("feat-abc");
    expect(entry?.summary).toContain("Bulk export");
  });
});
