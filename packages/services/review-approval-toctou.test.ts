/**
 * Behavioral test for recordHumanApproval in-transaction TOCTOU re-check.
 * Simulates a concurrent AI review invalidating eligibility inside the txn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "./errors";

const txMocks = vi.hoisted(() => ({
  featureStatus: "human_review" as string,
  latestReview: {
    readyForHuman: true,
    issues: [] as Array<{ severity: string; resolved: boolean }>,
    rawAnalysis: {},
  },
}));

vi.mock("./runtime-env", () => ({
  isProductionEnv: vi.fn(() => false),
}));

vi.mock("./feature-request", () => ({
  getFeatureRequest: vi.fn(async () => ({
    id: "feat-1",
    status: "human_review",
    organizationId: "org-1",
  })),
  appendFeatureActivity: vi.fn(async () => undefined),
  guardedUpdateFeatureStatusInTx: vi.fn(async () => ({ id: "feat-1", status: "approved" })),
}));

vi.mock("./workflow-guards", () => ({
  assertReleaseReviewer: vi.fn(async () => ({
    ws: { role: "owner", organizationId: "org-1" },
    feature: { id: "feat-1", status: "human_review" },
  })),
  assertReviewIssueInUserWorkspace: vi.fn(async () => ({})),
}));

vi.mock("./slack/notify", () => ({
  notifySlackFeatureApproved: vi.fn(async () => undefined),
}));

vi.mock("./db/transaction", () => ({
  withTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      query: {
        featureRequests: {
          findFirst: vi.fn(async () => ({ status: txMocks.featureStatus })),
        },
        aiReviews: {
          findFirst: vi.fn(async () => txMocks.latestReview),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
    };
    return fn(tx);
  }),
}));

describe("recordHumanApproval — in-transaction TOCTOU re-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMocks.featureStatus = "human_review";
    txMocks.latestReview = {
      readyForHuman: true,
      issues: [],
      rawAnalysis: {},
    };
  });

  it("blocks approval when concurrent review adds blocking issues inside txn", async () => {
    txMocks.latestReview = {
      readyForHuman: false,
      issues: [{ severity: "blocking", resolved: false }],
      rawAnalysis: {},
    };

    const { recordHumanApproval } = await import("./review");

    await expect(
      recordHumanApproval({
        featureRequestId: "feat-1",
        reviewerUserId: "user-1",
        decision: "approved",
        skipEligibilityCheck: true,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("allows approval when in-txn snapshot still shows eligible review", async () => {
    const { recordHumanApproval } = await import("./review");

    const result = await recordHumanApproval({
      featureRequestId: "feat-1",
      reviewerUserId: "user-1",
      decision: "approved",
      skipEligibilityCheck: true,
    });

    expect(result.decision).toBe("approved");
    expect(result.nextStatus).toBe("approved");
  });

  it("throws when status raced to fix_needed before txn opened", async () => {
    txMocks.featureStatus = "fix_needed";

    const { recordHumanApproval } = await import("./review");

    await expect(
      recordHumanApproval({
        featureRequestId: "feat-1",
        reviewerUserId: "user-1",
        decision: "approved",
        skipEligibilityCheck: true,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
