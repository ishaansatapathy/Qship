import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const humanFindFirst = vi.fn();
  const featureFindFirst = vi.fn();
  const mockInsert = vi.fn(() => ({ values: vi.fn(async () => ({})) }));
  const mockUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(async () => [{}]) })),
    })),
  }));
  return { humanFindFirst, featureFindFirst, mockInsert, mockUpdate };
});

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  return {
    ...actual,
    default: {
      query: {
        humanApprovals: { findFirst: dbMocks.humanFindFirst },
        featureRequests: { findFirst: dbMocks.featureFindFirst },
      },
      insert: dbMocks.mockInsert,
      update: dbMocks.mockUpdate,
    },
  };
});

vi.mock("./feature-request", () => ({
  getFeatureRequest: vi.fn(async () => ({
    id: "feat-1",
    status: "approved",
    title: "Test",
    pullRequests: [],
  })),
  appendFeatureActivity: vi.fn(async () => ({})),
  guardedUpdateFeatureStatusInTx: vi.fn(async () => ({})),
  assertFeatureInUserWorkspace: vi.fn(async () => ({})),
}));

vi.mock("./workflow-guards", () => ({
  assertReleaseReviewer: vi.fn(async () => ({ ws: {}, feature: {} })),
  assertReviewIssueInUserWorkspace: vi.fn(async () => ({})),
}));

vi.mock("./slack", () => ({
  notifySlackFeatureApproved: vi.fn(async () => ({ sent: false, simulated: true })),
}));

import { recordHumanApproval } from "./review";

describe("recordHumanApproval idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.humanFindFirst.mockResolvedValue({
      id: "approval-existing",
      decision: "approved",
    });
  });

  it("returns existing approval when feature is already approved", async () => {
    const result = await recordHumanApproval({
      featureRequestId: "feat-1",
      reviewerUserId: "user-1",
      decision: "approved",
    });

    expect(result).toMatchObject({
      id: "approval-existing",
      decision: "approved",
      nextStatus: "approved",
      idempotent: true,
    });
    expect(dbMocks.mockInsert).not.toHaveBeenCalled();
  });
});
