import { describe, expect, it } from "vitest";

import {
  ENGINEERING_TASK_STATUSES,
  FEATURE_STATUSES,
  SHIPFLOW_PHASES,
  WORKFLOW_TYPES,
} from "./workflow";

describe("workflow constants", () => {
  it("defines a complete feature lifecycle", () => {
    expect(FEATURE_STATUSES).toContain("submitted");
    expect(FEATURE_STATUSES).toContain("human_review");
    expect(FEATURE_STATUSES).toContain("shipped");
    expect(FEATURE_STATUSES.length).toBeGreaterThanOrEqual(10);
  });

  it("maps every status to exactly one phase bucket", () => {
    const phased = [
      ...SHIPFLOW_PHASES.discovery,
      ...SHIPFLOW_PHASES.planning,
      ...SHIPFLOW_PHASES.development,
      ...SHIPFLOW_PHASES.aiReview,
      ...SHIPFLOW_PHASES.release,
    ];
    for (const status of FEATURE_STATUSES) {
      expect(phased).toContain(status);
    }
  });

  it("defines Kanban task columns in delivery order", () => {
    expect(ENGINEERING_TASK_STATUSES[0]).toBe("backlog");
    expect(ENGINEERING_TASK_STATUSES.at(-1)).toBe("done");
  });

  it("lists async workflow job types", () => {
    expect(WORKFLOW_TYPES).toContain("prd_generation");
    expect(WORKFLOW_TYPES).toContain("ai_review");
    expect(WORKFLOW_TYPES).toContain("re_review");
  });
});
