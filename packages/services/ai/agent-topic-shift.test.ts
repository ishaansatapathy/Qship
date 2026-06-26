import { describe, expect, it } from "vitest";

import { detectTopicShift } from "./agent-topic-shift";

describe("detectTopicShift", () => {
  it("keeps focus when user uses deictic reference", () => {
    expect(
      detectTopicShift("Summarize this for me", { contextId: "t-1" }, [
        { at: "1", tool: "get_feature_request", summary: "Read Cohort launch feature" },
      ]),
    ).toEqual({ shouldClearFocus: false });
  });

  it("clears focus on explicit calendar intent", () => {
    expect(detectTopicShift("What meetings do I have tomorrow?", { contextId: "t-1" })).toEqual({
      shouldClearFocus: true,
      reason: "calendar_intent",
    });
  });

  it("clears focus on new inbox search without deictics", () => {
    expect(
      detectTopicShift("Search my inbox for investor update about Series B funding", { contextId: "t-old" }, [
        { at: "1", tool: "get_feature_request", summary: "Summarized Cohort launch" },
      ]),
    ).toEqual({ shouldClearFocus: true, reason: "new_search" });
  });

  it("keeps focus when search overlaps recent memory topic", () => {
    expect(
      detectTopicShift("Search for cohort launch details", { contextId: "t-1" }, [
        { at: "1", tool: "get_feature_request", summary: "Summarized cohort launch planning" },
      ]),
    ).toEqual({ shouldClearFocus: false });
  });
});
