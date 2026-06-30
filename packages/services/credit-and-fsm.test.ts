/**
 * credit-and-fsm.test.ts
 *
 * Unit tests for:
 *  1. consumeAiReviewCredit — atomic decrement with zero-credit guard
 *  2. FSM isFeatureTransitionAllowed — exhaustive table test for every defined
 *     transition plus high-value blocked-jump assertions
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "./errors";
import { isFeatureTransitionAllowed } from "./feature-request";
import type { FeatureStatus } from "./workflow";

// ══════════════════════════════════════════════════════════════════════════════
// 1. consumeAiReviewCredit — mock db/transaction layer
// ══════════════════════════════════════════════════════════════════════════════

// Build a chainable Drizzle-like tx mock that returns a controlled rows array.
// The closure captures `currentRows` so each test can set it before calling.
let currentRows: unknown[] = [];

function makeTxMock() {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  // .returning() is the terminal call — resolves with the controlled rows
  builder.returning.mockImplementation(() => Promise.resolve(currentRows));
  return builder;
}

// withTransaction is hoisted; the callback receives the mock tx at call time
vi.mock("./db/transaction", () => ({
  withTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTxMock())),
}));

describe("consumeAiReviewCredit", () => {
  // Import lazily so the mock above is in place before module resolution
  let consumeAiReviewCredit: (orgId: string) => Promise<number>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ consumeAiReviewCredit } = await import("./review"));
  });

  it("returns remaining credits when decrement succeeds", async () => {
    currentRows = [{ aiReviewCredits: 4 }];
    const remaining = await consumeAiReviewCredit("org-123");
    expect(remaining).toBe(4);
  });

  it("throws PRECONDITION_FAILED when no credits remain (row is undefined)", async () => {
    // Empty rows → WHERE clause filtered the row (aiReviewCredits = 0)
    currentRows = [];
    await expect(consumeAiReviewCredit("org-zero")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("error message mentions Billing upgrade path", async () => {
    currentRows = [];
    await expect(consumeAiReviewCredit("org-zero")).rejects.toSatisfy((e: unknown) => {
      return e instanceof ServiceError && e.message.toLowerCase().includes("billing");
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. FSM — exhaustive transition table
// ══════════════════════════════════════════════════════════════════════════════

/** Every explicitly defined allowed edge in ALLOWED_TRANSITIONS. */
const ALLOWED_EDGES: [FeatureStatus, FeatureStatus][] = [
  // from submitted
  ["submitted",           "clarifying"],
  ["submitted",           "prd_generating"],
  ["submitted",           "duplicate_education"],
  ["submitted",           "rejected"],
  // from clarifying
  ["clarifying",          "prd_generating"],
  ["clarifying",          "rejected"],
  // from duplicate_education
  ["duplicate_education", "submitted"],
  ["duplicate_education", "rejected"],
  // from prd_generating
  ["prd_generating",      "prd_ready"],
  ["prd_generating",      "submitted"],
  // from prd_ready
  ["prd_ready",           "planning"],
  ["prd_ready",           "prd_generating"],
  // from planning
  ["planning",            "plan_approved"],
  ["planning",            "in_development"],
  ["planning",            "prd_ready"],
  // from plan_approved
  ["plan_approved",       "in_development"],
  // from in_development
  ["in_development",      "pr_open"],
  ["in_development",      "planning"],
  ["in_development",      "human_review"],
  // from pr_open (pr_open → approved removed — would bypass human_review gate)
  ["pr_open",             "ai_review"],
  ["pr_open",             "in_development"],
  ["pr_open",             "fix_needed"],
  ["pr_open",             "human_review"],
  // from ai_review
  ["ai_review",           "human_review"],
  ["ai_review",           "fix_needed"],
  ["ai_review",           "pr_open"],
  // from fix_needed (fix_needed → human_review removed — forces re-review first)
  ["fix_needed",          "ai_review"],
  ["fix_needed",          "pr_open"],
  // from human_review
  ["human_review",        "approved"],
  ["human_review",        "fix_needed"],
  ["human_review",        "rejected"],
  // from approved
  ["approved",            "shipped"],
  // from rejected
  ["rejected",            "submitted"],
];

/** Critical transitions that MUST be blocked to preserve the review gate. */
const BLOCKED_EDGES: [FeatureStatus, FeatureStatus][] = [
  // Cannot skip PRD/planning
  ["submitted",    "shipped"],
  ["submitted",    "approved"],
  ["submitted",    "ai_review"],
  ["submitted",    "human_review"],
  // Cannot skip AI review and human approval
  ["prd_ready",    "human_review"],
  ["prd_ready",    "approved"],
  ["prd_ready",    "shipped"],
  // Cannot bypass human approval
  ["ai_review",    "shipped"],
  ["ai_review",    "approved"],
  ["pr_open",      "shipped"],
  // Shortcuts that bypass the review / approval gate (removed from FSM)
  ["pr_open",      "approved"],
  ["fix_needed",   "human_review"],
  // Terminal state is truly terminal
  ["shipped",      "submitted"],
  ["shipped",      "approved"],
  ["shipped",      "in_development"],
  // Cannot go backwards into rejected from terminal
  ["approved",     "rejected"],
  ["approved",     "human_review"],
];

describe("FSM isFeatureTransitionAllowed — allowed edges", () => {
  it.each(ALLOWED_EDGES)("allows %s → %s", (from, to) => {
    expect(isFeatureTransitionAllowed(from, to)).toBe(true);
  });
});

describe("FSM isFeatureTransitionAllowed — blocked edges", () => {
  it.each(BLOCKED_EDGES)("blocks %s → %s", (from, to) => {
    expect(isFeatureTransitionAllowed(from, to)).toBe(false);
  });
});

describe("FSM isFeatureTransitionAllowed — self-transitions", () => {
  const allStates: FeatureStatus[] = [
    "submitted", "clarifying", "duplicate_education", "prd_generating",
    "prd_ready", "planning", "plan_approved", "in_development",
    "pr_open", "ai_review", "fix_needed", "human_review",
    "approved", "shipped", "rejected",
  ];

  it.each(allStates.map((s) => [s] as [FeatureStatus]))("%s → %s (self) is allowed", (state) => {
    expect(isFeatureTransitionAllowed(state, state)).toBe(true);
  });

  it("covers all 15 feature statuses", () => {
    expect(allStates).toHaveLength(15);
  });
});

describe("FSM — shipped is terminal", () => {
  const allStates: FeatureStatus[] = [
    "submitted", "clarifying", "duplicate_education", "prd_generating",
    "prd_ready", "planning", "plan_approved", "in_development",
    "pr_open", "ai_review", "fix_needed", "human_review",
    "approved", "rejected",
  ];

  it.each(allStates.map((s) => [s] as [FeatureStatus]))(
    "shipped → %s is blocked",
    (target) => {
      expect(isFeatureTransitionAllowed("shipped", target)).toBe(false);
    },
  );
});
