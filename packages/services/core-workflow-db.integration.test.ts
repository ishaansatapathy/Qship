import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "@repo/database";
import db from "@repo/database";
import {
  aiReviews,
  featureRequests,
  humanApprovals,
  organizationMembers,
  organizations,
  projects,
  pullRequests,
  repositories,
} from "@repo/database/schema";

import type * as FeatureRequestModule from "./feature-request";
import { transitionFeatureStatus } from "./feature-request";
import { persistAiReview, recordHumanApproval, markFeatureShipped } from "./review";
import { buildPassingAiReview } from "./test-fixtures/ai-review";
import type { FeatureStatus } from "./workflow";

vi.mock("./feature-request", async (importOriginal) => {
  const actual = await importOriginal<typeof FeatureRequestModule>();
  const { eq: eqOp } = await import("@repo/database");
  const dbConn = (await import("@repo/database")).default;
  const schema = await import("@repo/database/schema");
  const { ServiceError } = await import("./errors");

  async function getFeatureRequestLite(id: string) {
    const row = await dbConn.query.featureRequests.findFirst({
      where: eqOp(schema.featureRequests.id, id),
    });
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Feature request not found");
    }

    const [reviews, approvals, prs] = await Promise.all([
      dbConn.query.aiReviews.findMany({
        where: eqOp(schema.aiReviews.featureRequestId, id),
        with: { issues: true },
        orderBy: (r, { desc: d }) => [d(r.createdAt)],
      }),
      dbConn.query.humanApprovals.findMany({
        where: eqOp(schema.humanApprovals.featureRequestId, id),
        orderBy: (h, { desc: d }) => [d(h.createdAt)],
      }),
      dbConn.query.pullRequests.findMany({
        where: eqOp(schema.pullRequests.featureRequestId, id),
        with: { repository: true },
      }),
    ]);

    return {
      ...row,
      prd: undefined,
      tasks: [],
      clarifications: [],
      pullRequests: prs,
      aiReviews: reviews,
      humanApprovals: approvals,
    } as unknown as Awaited<ReturnType<typeof actual.getFeatureRequest>>;
  }

  async function updateFeatureMetadataLite(
    featureRequestId: string,
    metadata: Record<string, unknown>,
  ) {
    const row = await dbConn.query.featureRequests.findFirst({
      where: eqOp(schema.featureRequests.id, featureRequestId),
      columns: { metadata: true },
    });
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Feature request not found");
    }

    const merged = { ...(row.metadata ?? {}), ...metadata };
    const [updated] = await dbConn
      .update(schema.featureRequests)
      .set({ metadata: merged, updatedAt: new Date() })
      .where(eqOp(schema.featureRequests.id, featureRequestId))
      .returning();
    return updated!;
  }

  async function appendFeatureActivityLite(
    featureRequestId: string,
    event: Parameters<typeof actual.appendFeatureActivity>[1],
  ) {
    const row = await dbConn.query.featureRequests.findFirst({
      where: eqOp(schema.featureRequests.id, featureRequestId),
      columns: { metadata: true },
    });
    if (!row) {
      throw new ServiceError("NOT_FOUND", "Feature request not found");
    }

    const prior =
      (row.metadata?.activity as FeatureRequestModule.FeatureActivityEntry[] | undefined) ?? [];
    const entry: FeatureRequestModule.FeatureActivityEntry = {
      id: crypto.randomUUID(),
      at: event.at ?? new Date().toISOString(),
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      actor: event.actor ?? "system",
    };

    await updateFeatureMetadataLite(featureRequestId, {
      activity: [...prior, entry].slice(-50),
    });
    return entry;
  }

  return {
    ...actual,
    getFeatureRequest: getFeatureRequestLite,
    updateFeatureMetadata: updateFeatureMetadataLite,
    appendFeatureActivity: appendFeatureActivityLite,
    assertFeatureInUserWorkspace: async (userId: string, featureId: string) => {
      const ws = await actual.getWorkspaceProjectForUser(userId);
      if (!ws) {
        throw new ServiceError("FORBIDDEN", "Join a workspace before accessing feature requests");
      }

      const feature = await getFeatureRequestLite(featureId);
      if (feature.projectId !== ws.project.id) {
        throw new ServiceError("FORBIDDEN", "Feature request is not in your workspace");
      }

      return { ws, feature };
    },
  };
});

vi.mock("./github/release-ship", () => ({
  executeFeatureRelease: vi.fn(async () => ({
    merge: { attempted: false, merged: false, reason: "no_linked_pr" as const },
    deploy: { attempted: true, triggered: true, simulated: false },
  })),
}));

vi.mock("./github/installation", () => ({
  getGithubConnectionForUser: vi.fn(async () => ({ installationId: null })),
}));

vi.mock("./slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./slack")>();
  return {
    ...actual,
    notifySlackFeatureApproved: vi.fn(async () => ({
      sent: false,
      simulated: true,
      channel: null,
    })),
    notifySlackFeatureShipped: vi.fn(async () => ({
      sent: false,
      simulated: true,
      channel: null,
    })),
  };
});

const PRE_REVIEW_PATH: FeatureStatus[] = [
  "submitted",
  "prd_generating",
  "prd_ready",
  "planning",
  "in_development",
  "pr_open",
  "ai_review",
];

describe("core workflow db e2e", () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const orgId = `e2e-org-${runId}`;
  const projectId = `e2e-project-${runId}`;
  const submitterId = `e2e-submitter-${runId}`;
  const reviewerId = `e2e-reviewer-${runId}`;
  const featureId = `e2e-feature-${runId}`;
  const repoId = `e2e-repo-${runId}`;
  const prId = `e2e-pr-${runId}`;

  let dbReady = false;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOW_SIMULATED_DEPLOY = "true";
    try {
      const { pingDatabase } = await import("@repo/database/health");
      await pingDatabase();
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  afterAll(async () => {
    if (!dbReady) return;

    await db.delete(featureRequests).where(eq(featureRequests.id, featureId));
    await db.delete(pullRequests).where(eq(pullRequests.id, prId));
    await db.delete(repositories).where(eq(repositories.id, repoId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.execute(sql`DELETE FROM shipflow_users WHERE id IN (${submitterId}, ${reviewerId})`);
  });

  it("persists AI review → human approval → shipped in Postgres", async (ctx) => {
    if (!dbReady) ctx.skip();

    await db.execute(sql`
      INSERT INTO shipflow_users (id, name, email, email_verified)
      VALUES
        (${submitterId}, 'E2E Submitter', ${`e2e-submitter-${runId}@qship.test`}, false),
        (${reviewerId}, 'E2E Reviewer', ${`e2e-reviewer-${runId}@qship.test`}, false)
    `);

    await db.insert(organizations).values({
      id: orgId,
      name: `E2E Org ${runId}`,
      slug: `e2e-org-${runId}`,
      aiReviewCredits: 5,
    });

    await db.insert(organizationMembers).values([
      {
        id: `e2e-member-submitter-${runId}`,
        organizationId: orgId,
        userId: submitterId,
        role: "member",
      },
      {
        id: `e2e-member-reviewer-${runId}`,
        organizationId: orgId,
        userId: reviewerId,
        role: "owner",
      },
    ]);

    await db.insert(projects).values({
      id: projectId,
      organizationId: orgId,
      name: "E2E Project",
    });

    await db.insert(featureRequests).values({
      id: featureId,
      organizationId: orgId,
      projectId,
      title: "E2E export workflow",
      rawRequest: "Add CSV export for compliance reports",
      status: "submitted",
      createdByUserId: submitterId,
      source: "manual",
    });

    await db.insert(repositories).values({
      id: repoId,
      organizationId: orgId,
      projectId,
      githubRepoId: `gh-${runId}`,
      owner: "e2e",
      name: "repo",
      fullName: "e2e/repo",
      defaultBranch: "main",
    });

    await db.insert(pullRequests).values({
      id: prId,
      featureRequestId: featureId,
      repositoryId: repoId,
      githubPrNumber: 1,
      githubPrId: `gh-pr-${runId}`,
      title: "E2E PR",
      url: "https://github.com/e2e/repo/pull/1",
      headSha: "abc123",
      baseBranch: "main",
      state: "open",
    });

    for (let i = 0; i < PRE_REVIEW_PATH.length - 1; i++) {
      const to = PRE_REVIEW_PATH[i + 1]!;
      await transitionFeatureStatus(featureId, to);
    }

    const review = await persistAiReview({
      featureRequestId: featureId,
      pullRequestId: prId,
      review: buildPassingAiReview({
        summary: "All acceptance criteria met in E2E test.",
      }),
    });
    expect(review.nextStatus).toBe("human_review");

    await recordHumanApproval({
      featureRequestId: featureId,
      reviewerUserId: reviewerId,
      decision: "approved",
      notes: "E2E approval",
    });

    const shipped = await markFeatureShipped(featureId, reviewerId);
    expect(shipped.status).toBe("shipped");

    const row = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, featureId),
      columns: { status: true },
    });
    expect(row?.status).toBe("shipped");
  });
});
