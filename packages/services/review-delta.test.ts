import { describe, expect, it } from "vitest";

import { computeReviewDelta } from "./review";

// ── Helpers ────────────────────────────────────────────────────────────────────

function blocking(title: string, filePath?: string) {
  return { severity: "blocking" as const, title, filePath: filePath ?? null };
}

function nonBlocking(title: string) {
  return { severity: "non_blocking" as const, title, filePath: null };
}

function snapshot(iteration: number, issues: ReturnType<typeof blocking | typeof nonBlocking>[]) {
  return { iteration, issues };
}

// ── computeReviewDelta ─────────────────────────────────────────────────────────

describe("computeReviewDelta — pure logic", () => {
  it("improved: all prior blocking issues resolved, no new ones", () => {
    const prev = snapshot(1, [blocking("SQL injection in query builder", "src/db.ts")]);
    const latest = snapshot(2, []);

    const delta = computeReviewDelta(latest, prev);

    expect(delta.overallProgress).toBe("improved");
    expect(delta.resolved).toHaveLength(1);
    expect(delta.persisting).toHaveLength(0);
    expect(delta.newIssues).toHaveLength(0);
    expect(delta.fromIteration).toBe(1);
    expect(delta.toIteration).toBe(2);
    expect(delta.iterationSummary).toMatch(/resolved/i);
  });

  it("regressed: new issues outnumber resolved ones", () => {
    const prev = snapshot(1, [blocking("Missing auth guard", "src/api.ts")]);
    const latest = snapshot(2, [
      blocking("Missing auth guard", "src/api.ts"), // persisting
      blocking("N+1 query in user list", "src/users.ts"), // new
      blocking("Rate limit bypass", "src/auth.ts"), // new
    ]);

    const delta = computeReviewDelta(latest, prev);

    expect(delta.overallProgress).toBe("regressed");
    expect(delta.resolved).toHaveLength(0);
    expect(delta.persisting).toHaveLength(1);
    expect(delta.newIssues).toHaveLength(2);
    expect(delta.iterationSummary).toMatch(/regression|new blocking/i);
  });

  it("same: some issues resolved but new ones introduced at equal rate", () => {
    const prev = snapshot(1, [
      blocking("Old issue A", "src/a.ts"),
      blocking("Old issue B", "src/b.ts"),
    ]);
    const latest = snapshot(2, [
      blocking("Old issue B", "src/b.ts"), // persisting
      blocking("New issue C", "src/c.ts"), // new — same count as resolved
    ]);

    const delta = computeReviewDelta(latest, prev);

    expect(delta.overallProgress).toBe("same");
    expect(delta.resolved).toHaveLength(1);
    expect(delta.persisting).toHaveLength(1);
    expect(delta.newIssues).toHaveLength(1);
  });

  it("ignores non_blocking issues entirely", () => {
    const prev = snapshot(1, [nonBlocking("Minor lint"), nonBlocking("Style issue")]);
    const latest = snapshot(2, []);

    const delta = computeReviewDelta(latest, prev);

    // Non-blocking issues should not contribute to resolved/persisting/new
    expect(delta.overallProgress).toBe("same");
    expect(delta.resolved).toHaveLength(0);
    expect(delta.persisting).toHaveLength(0);
    expect(delta.newIssues).toHaveLength(0);
  });

  it("two issues with same title but different filePaths are treated as distinct", () => {
    const prev = snapshot(1, [
      blocking("Missing null check", "src/a.ts"),
      blocking("Missing null check", "src/b.ts"),
    ]);
    const latest = snapshot(2, [
      blocking("Missing null check", "src/a.ts"), // only one resolved
    ]);

    const delta = computeReviewDelta(latest, prev);

    expect(delta.resolved).toHaveLength(1);
    expect(delta.persisting).toHaveLength(1);
    expect(delta.newIssues).toHaveLength(0);
  });

  it("title containing pipe character does not cause false key collision", () => {
    // Previously the separator was "|" which would collide if the title contains "|"
    const prev = snapshot(1, [blocking("Issue|with|pipes", "src/x.ts")]);
    const latest = snapshot(2, [blocking("Issue", "with|pipes")]);

    // Different title+path combos — should NOT match as resolved
    const delta = computeReviewDelta(latest, prev);

    expect(delta.resolved).toHaveLength(1); // prev issue not in latest
    expect(delta.newIssues).toHaveLength(1); // latest issue not in prev
    expect(delta.persisting).toHaveLength(0);
  });

  it("all-clear: no issues in either iteration", () => {
    const delta = computeReviewDelta(snapshot(2, []), snapshot(1, []));
    expect(delta.overallProgress).toBe("same");
    expect(delta.resolved).toHaveLength(0);
    expect(delta.persisting).toHaveLength(0);
    expect(delta.newIssues).toHaveLength(0);
  });

  it("iterationSummary message mentions iteration numbers", () => {
    const prev = snapshot(3, [blocking("X", "src/x.ts")]);
    const latest = snapshot(4, []);

    const delta = computeReviewDelta(latest, prev);

    expect(delta.iterationSummary).toContain("3");
  });
});
