import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "./errors";

const mockAssertFeature = vi.hoisted(() => vi.fn());

vi.mock("./feature-request", () => ({
  assertFeatureInUserWorkspace: mockAssertFeature,
}));

vi.mock("@repo/database", () => ({
  default: {
    query: {
      aiReviews: { findFirst: vi.fn() },
    },
  },
  eq: (...args: unknown[]) => args,
}));

import { assertAiReviewInUserWorkspace } from "./review";
import db from "@repo/database";

describe("review workspace auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assertAiReviewInUserWorkspace rejects cross-tenant access", async () => {
    vi.mocked(db.query.aiReviews.findFirst).mockResolvedValueOnce({
      id: "review-1",
      featureRequestId: "feat-other-org",
    } as never);
    mockAssertFeature.mockRejectedValueOnce(
      new ServiceError("FORBIDDEN", "Feature not in your workspace"),
    );

    await expect(assertAiReviewInUserWorkspace("user-a", "review-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockAssertFeature).toHaveBeenCalledWith("user-a", "feat-other-org");
  });

  it("assertAiReviewInUserWorkspace allows same-workspace access", async () => {
    vi.mocked(db.query.aiReviews.findFirst).mockResolvedValueOnce({
      id: "review-2",
      featureRequestId: "feat-mine",
    } as never);
    mockAssertFeature.mockResolvedValueOnce({ ws: {}, feature: {} });

    const review = await assertAiReviewInUserWorkspace("user-b", "review-2");
    expect(review.featureRequestId).toBe("feat-mine");
  });
});

describe("resolveReviewIssue auth", () => {
  it("requires userId", async () => {
    const { resolveReviewIssue } = await import("./review");
    await expect(resolveReviewIssue("issue-1", true)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
