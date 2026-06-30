/**
 * tRPC route caller tests — verifies that procedures throw the correct tRPC
 * error codes without needing a live database.  Uses createCallerFactory to
 * invoke procedures directly with a mocked context.
 *
 * These tests sit at the tRPC adapter layer (above service mocks) and below
 * the HTTP transport — exactly the gap that was missing before 15/15 hardening.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Mock all service-layer modules ────────────────────────────────────────────

vi.mock("@repo/database", () => ({
  default: { query: {}, execute: vi.fn() },
  eq: (...a: unknown[]) => a,
  and: (...a: unknown[]) => a,
  desc: (v: unknown) => v,
  sql: (v: unknown) => v,
}));

vi.mock("@repo/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/services/feature-request", () => ({
  getWorkspaceProjectForUser: vi.fn(),
  assertFeatureInUserWorkspace: vi.fn(),
  listFeatureRequests: vi.fn(),
  getPipelineSummary: vi.fn(),
  getIntakeSummary: vi.fn(),
  getFeatureDeliveryView: vi.fn(),
  getFeatureRequest: vi.fn(),
  listTaskBoard: vi.fn(),
  assertTaskInUserWorkspace: vi.fn(),
  updateEngineeringTaskStatus: vi.fn(),
  appendFeatureActivity: vi.fn(),
  guardedUpdateFeatureStatus: vi.fn(),
  isFeatureTransitionAllowed: vi.fn(),
}));

vi.mock("@repo/services/feature-intake", () => ({
  ingestFeatureRequest: vi.fn(),
  getIntakeSummary: vi.fn(),
}));

vi.mock("@repo/services/inngest/dispatch", () => ({
  dispatchAiReview: vi.fn(),
  dispatchPrdGeneration: vi.fn(),
  dispatchTaskGeneration: vi.fn(),
  dispatchCodeImplementation: vi.fn(),
  recoverStaleWorkflowRuns: vi.fn(),
}));

vi.mock("@repo/services/workflow-runs", () => ({
  cancelActiveWorkflowRuns: vi.fn(),
  listWorkflowRunsForFeature: vi.fn(),
}));

vi.mock("@repo/services/github/installation", () => ({
  getGithubConnectionForUser: vi.fn(),
}));

vi.mock("@repo/services/github/pr", () => ({
  createFeaturePullRequest: vi.fn(),
}));

vi.mock("@repo/services/review", () => ({
  listAiReviewsForFeature: vi.fn(),
  markFeatureShipped: vi.fn(),
  recordHumanApproval: vi.fn(),
  validateHumanApprovalEligibility: vi.fn(),
  listHumanApprovals: vi.fn(),
  getHumanApprovalEligibility: vi.fn(),
  getReviewDelta: vi.fn(),
  getReviewStats: vi.fn(),
  getLatestAiReview: vi.fn(),
  resolveReviewIssue: vi.fn(),
  getIssueResolutionSummary: vi.fn(),
  getReviewLoopHealth: vi.fn(),
  assertAiReviewInUserWorkspace: vi.fn(),
}));

vi.mock("@repo/services/feature-ai", () => ({
  generateApprovalBriefing: vi.fn(),
  analyzeChangeRequest: vi.fn(),
  generateDeveloperOnboardingGuide: vi.fn(),
}));

vi.mock("@repo/services/workflow-guards", () => ({
  assertReleaseReviewer: vi.fn(),
  assertReviewIssueInUserWorkspace: vi.fn(),
}));

vi.mock("@repo/services/task-walkthrough", () => ({
  explainEngineeringTaskForUser: vi.fn(),
  getTaskWalkthroughState: vi.fn(),
}));

vi.mock("@repo/services/feature-analytics", () => ({
  predictDeliveryTimeline: vi.fn(),
  checkPipelineDuplicates: vi.fn(),
  getPipelineHealthSummary: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { createCallerFactory } from "./trpc";
import { featureRouter } from "./routes/feature/route";
import { getWorkspaceProjectForUser, listFeatureRequests, assertFeatureInUserWorkspace } from "@repo/services/feature-request";
import { getHumanApprovalEligibility, validateHumanApprovalEligibility, recordHumanApproval } from "@repo/services/review";
import { assertReleaseReviewer } from "@repo/services/workflow-guards";

// ── Context factories ─────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<{ user: { id: string; email: string; emailVerified: boolean }; requestId: string }> = {}) {
  return {
    requestId: "test-req-1",
    user: {
      id: "user-1",
      email: "test@example.com",
      emailVerified: true,
      displayName: "Test User",
    },
    ...overrides,
  };
}

const callerFactory = createCallerFactory(featureRouter);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("feature.list — UNAUTHORIZED when no user in context", () => {
  it("throws UNAUTHORIZED for unauthenticated calls", async () => {
    const caller = callerFactory({ requestId: "test", user: null as never });
    await expect(caller.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("feature.list — returns empty array when no workspace", () => {
  beforeEach(() => {
    vi.mocked(getWorkspaceProjectForUser).mockResolvedValue(null);
  });

  it("returns [] when user has no workspace", async () => {
    const caller = callerFactory(makeCtx());
    const result = await caller.list();
    expect(result).toEqual([]);
  });
});

describe("feature.list — delegates to listFeatureRequests", () => {
  beforeEach(() => {
    vi.mocked(getWorkspaceProjectForUser).mockResolvedValue({
      organization: { id: "org-1", name: "Org" },
      project: { id: "proj-1", name: "Project" },
      role: "owner",
    } as never);
    vi.mocked(listFeatureRequests).mockResolvedValue([
      { id: "feat-1", title: "Feature 1" },
    ] as never);
  });

  it("returns feature list from service", async () => {
    const caller = callerFactory(makeCtx());
    const result = await caller.list();
    expect(result).toHaveLength(1);
    expect((result as Array<{ id: string }>)[0]?.id).toBe("feat-1");
  });
});

describe("feature.getApprovalEligibility — workspace check enforced", () => {
  it("propagates ServiceError when user not in workspace", async () => {
    vi.mocked(assertFeatureInUserWorkspace).mockRejectedValue(
      Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" }),
    );
    const caller = callerFactory(makeCtx());
    await expect(caller.getApprovalEligibility({ id: "feat-1" })).rejects.toThrow();
  });

  it("delegates to getHumanApprovalEligibility when workspace passes", async () => {
    vi.mocked(assertFeatureInUserWorkspace).mockResolvedValue({ feature: { id: "feat-1" } } as never);
    vi.mocked(getHumanApprovalEligibility).mockResolvedValue({
      eligible: true,
      status: "human_review",
      blockingCount: 0,
    });
    const caller = callerFactory(makeCtx());
    const result = await caller.getApprovalEligibility({ id: "feat-1" });
    expect(result).toMatchObject({ eligible: true });
  });
});

describe("feature.approve — gate enforced before record", () => {
  it("calls validateHumanApprovalEligibility before recordHumanApproval", async () => {
    const order: string[] = [];
    vi.mocked(assertReleaseReviewer).mockImplementation(async () => { order.push("reviewer"); });
    vi.mocked(validateHumanApprovalEligibility).mockImplementation(async () => { order.push("validate"); return {} as never; });
    vi.mocked(recordHumanApproval).mockImplementation(async () => { order.push("record"); return { id: "a1", decision: "approved", nextStatus: "approved" } as never; });

    const caller = callerFactory(makeCtx());
    await caller.approve({ id: "feat-1" });

    expect(order).toEqual(["reviewer", "validate", "record"]);
  });
});

describe("feature.listStatuses — public endpoint", () => {
  it("returns all pipeline statuses without authentication", async () => {
    // publicProcedure — no user needed; zodUndefinedModel is z.object({}).strict()
    const caller = callerFactory({ requestId: "test", user: null as never });
    const result = await caller.listStatuses({});
    expect(result.statuses).toBeInstanceOf(Array);
    expect(result.statuses.length).toBeGreaterThan(5);
    expect(result.coreLoop).toContain("Human Approval");
  });
});

describe("feature.create — FORBIDDEN when no workspace", () => {
  it("throws when user has no workspace", async () => {
    vi.mocked(getWorkspaceProjectForUser).mockResolvedValue(null);
    const caller = callerFactory(makeCtx());
    await expect(
      caller.create({ title: "New feature", rawRequest: "Need a dark mode for the dashboard" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
