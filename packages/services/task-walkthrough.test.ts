import { describe, expect, it } from "vitest";

import { orderTasks, resolveTaskIndex } from "./task-walkthrough";

describe("task walkthrough ordering", () => {
  it("orders tasks by sortOrder then createdAt", () => {
    const tasks = [
      { id: "b", sortOrder: 1, createdAt: new Date("2026-01-02") },
      { id: "a", sortOrder: 0, createdAt: new Date("2026-01-03") },
      { id: "c", sortOrder: 1, createdAt: new Date("2026-01-01") },
    ];
    const ordered = orderTasks(tasks);
    expect(ordered.map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("resolves 1-based task index", () => {
    const tasks = [{ id: "x" }, { id: "y" }, { id: "z" }];
    expect(resolveTaskIndex(tasks, "y")).toBe(2);
    expect(resolveTaskIndex(tasks, "missing")).toBe(1);
  });
});
