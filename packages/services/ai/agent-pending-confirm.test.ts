import { describe, expect, it } from "vitest";

import {
  createPendingConfirmation,
  describePendingAction,
  isPendingExpired,
  pendingMatchesTool,
} from "./agent-pending-confirm";

describe("agent pending confirmation", () => {
  it("describes pending actions with feature id", () => {
    expect(describePendingAction("generate_feature_prd", { id: "feat-1" })).toContain("feat-1");
  });

  it("matches pending tool names exactly", () => {
    const pending = createPendingConfirmation("ship_feature", { id: "feat-1" });
    expect(pendingMatchesTool(pending, "ship_feature")).toBe(true);
    expect(pendingMatchesTool(pending, "approve_feature")).toBe(false);
  });

  it("expires stale pending confirmations", () => {
    const pending = createPendingConfirmation("run_ai_review", { id: "feat-1" });
    pending.proposedAt = new Date(Date.now() - 31 * 60_000).toISOString();
    expect(isPendingExpired(pending)).toBe(true);
  });
});
