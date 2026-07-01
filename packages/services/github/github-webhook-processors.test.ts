import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsDuplicate = vi.fn();
const mockTransition = vi.fn();
const mockAppend = vi.fn();
const mockInvalidate = vi.fn();

const installMocks = vi.hoisted(() => ({
  syncInstallationRepositoriesForOrg: vi.fn(async () => undefined),
  dispatchWebhookPullRequestAiReview: vi.fn(async () => ({
    queued: true,
    workflowRunId: "wf-test",
  })),
}));

const dbMocks = vi.hoisted(() => {
  const orgFindFirst = vi.fn();
  const repoFindFirst = vi.fn();
  const featureFindFirst = vi.fn();
  const approvalFindFirst = vi.fn();
  const pullRequestFindFirst = vi.fn();
  const mockOnConflict = vi.fn(async () => ({}));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockUpdate = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
  }));
  const mockDelete = vi.fn(() => ({ where: vi.fn(async () => ({})) }));
  return {
    orgFindFirst,
    repoFindFirst,
    featureFindFirst,
    approvalFindFirst,
    pullRequestFindFirst,
    mockInsert,
    mockUpdate,
    mockDelete,
  };
});

vi.mock("./webhook-dedup", () => ({
  isGithubDeliveryDuplicate: (...args: unknown[]) => mockIsDuplicate(...args),
}));

vi.mock("./pr-review", () => ({}));

vi.mock("./client", () => ({
  invalidateInstallationCache: (...args: unknown[]) => mockInvalidate(...args),
}));

vi.mock("../feature-request", () => ({
  transitionFeatureStatus: (...args: unknown[]) => mockTransition(...args),
  appendFeatureActivity: (...args: unknown[]) => mockAppend(...args),
}));

vi.mock("./installation", () => ({
  syncInstallationRepositoriesForOrg: installMocks.syncInstallationRepositoriesForOrg,
}));

vi.mock("./webhook-pr-review-dispatch", () => ({
  dispatchWebhookPullRequestAiReview: installMocks.dispatchWebhookPullRequestAiReview,
}));

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  return {
    ...actual,
    default: {
      query: {
        organizations: { findFirst: (...args: unknown[]) => dbMocks.orgFindFirst(...args) },
        repositories: { findFirst: (...args: unknown[]) => dbMocks.repoFindFirst(...args) },
        featureRequests: { findFirst: (...args: unknown[]) => dbMocks.featureFindFirst(...args) },
        humanApprovals: { findFirst: (...args: unknown[]) => dbMocks.approvalFindFirst(...args) },
        pullRequests: { findFirst: (...args: unknown[]) => dbMocks.pullRequestFindFirst(...args) },
      },
      insert: dbMocks.mockInsert,
      update: dbMocks.mockUpdate,
      delete: dbMocks.mockDelete,
    },
  };
});

import {
  processGithubInstallationWebhook,
  processGithubPullRequestWebhook,
  processGithubPushWebhook,
} from "./webhook";

const FEATURE_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORG_ID = "org-test";
const REPO_ROW_ID = "repo-row-1";

function basePullRequestPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "opened",
    installation: { id: 999 },
    repository: { id: 12345, full_name: "acme/core" },
    pull_request: {
      id: 777,
      number: 42,
      title: "feat: test",
      html_url: "https://github.com/acme/core/pull/42",
      state: "open",
      merged: false,
      head: { sha: "abc", ref: `shipflow/${FEATURE_ID}` },
      base: { ref: "main" },
      body: "",
    },
    ...overrides,
  };
}

describe("processGithubPullRequestWebhook (production)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDuplicate.mockResolvedValue(false);
    installMocks.syncInstallationRepositoriesForOrg.mockResolvedValue(undefined);
    installMocks.dispatchWebhookPullRequestAiReview.mockResolvedValue({
      queued: true,
      workflowRunId: "wf-test",
    });
    dbMocks.orgFindFirst.mockResolvedValue({ id: ORG_ID });
    dbMocks.repoFindFirst.mockResolvedValue({ id: REPO_ROW_ID });
    dbMocks.featureFindFirst.mockResolvedValue({
      id: FEATURE_ID,
      organizationId: ORG_ID,
      status: "in_development",
    });
    dbMocks.approvalFindFirst.mockResolvedValue(null);
  });

  it("returns duplicate_delivery when Postgres dedup hits", async () => {
    mockIsDuplicate.mockResolvedValueOnce(true);
    const result = await processGithubPullRequestWebhook(basePullRequestPayload(), "del-1");
    expect(result).toMatchObject({ handled: false, reason: "duplicate_delivery" });
  });

  it("returns missing_fields without PR metadata", async () => {
    const result = await processGithubPullRequestWebhook({ action: "opened" }, "del-2");
    expect(result).toMatchObject({ handled: false, reason: "missing_fields" });
  });

  it("returns unknown_installation when org is not linked", async () => {
    dbMocks.orgFindFirst.mockResolvedValueOnce(null);
    const result = await processGithubPullRequestWebhook(basePullRequestPayload(), "del-3");
    expect(result).toMatchObject({ handled: false, reason: "unknown_installation" });
  });

  it("auto-syncs repositories when repo row is missing then links PR", async () => {
    dbMocks.repoFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: REPO_ROW_ID });

    const result = await processGithubPullRequestWebhook(basePullRequestPayload(), "del-sync");

    expect(installMocks.syncInstallationRepositoriesForOrg).toHaveBeenCalledWith(ORG_ID, "999");
    expect(result).toMatchObject({
      handled: true,
      linked: true,
      autoSynced: true,
      featureId: FEATURE_ID,
    });
    expect(installMocks.dispatchWebhookPullRequestAiReview).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: FEATURE_ID,
        headSha: "abc",
      }),
    );
  });

  it("returns operator guidance when repo remains unsynced after auto-sync", async () => {
    dbMocks.repoFindFirst.mockResolvedValue(null);

    const result = await processGithubPullRequestWebhook(basePullRequestPayload(), "del-unsynced");

    expect(installMocks.syncInstallationRepositoriesForOrg).toHaveBeenCalledWith(ORG_ID, "999");
    expect(result).toMatchObject({
      handled: false,
      reason: "repo_not_synced",
      autoSynced: true,
      operatorAction: "sync_repositories",
    });
    expect(result).toHaveProperty("message");
  });

  it("queues async AI review for opened PRs", async () => {
    await processGithubPullRequestWebhook(basePullRequestPayload(), "del-review");
    expect(installMocks.dispatchWebhookPullRequestAiReview).toHaveBeenCalledWith({
      pullRequestId: `${ORG_ID}-pr-777`,
      featureId: FEATURE_ID,
      headSha: "abc",
    });
  });

  it("links opened PR and transitions feature to pr_open", async () => {
    const result = await processGithubPullRequestWebhook(basePullRequestPayload(), "del-4");
    expect(result).toMatchObject({
      handled: true,
      linked: true,
      featureId: FEATURE_ID,
      state: "open",
    });
    expect(mockTransition).toHaveBeenCalledWith(FEATURE_ID, "pr_open");
    expect(dbMocks.mockInsert).toHaveBeenCalled();
  });

  it("merged PR without prior approval gates at human_review", async () => {
    const payload = basePullRequestPayload({
      action: "closed",
      pull_request: {
        ...basePullRequestPayload().pull_request,
        merged: true,
        state: "closed",
      },
    });
    const result = await processGithubPullRequestWebhook(payload, "del-5");
    expect(result).toMatchObject({ handled: true, linked: true, state: "merged" });
    expect(mockTransition).toHaveBeenCalledWith(FEATURE_ID, "human_review");
  });

  it("merged PR with prior human approval transitions to approved", async () => {
    dbMocks.approvalFindFirst.mockResolvedValueOnce({ decision: "approved" });
    const payload = basePullRequestPayload({
      action: "closed",
      pull_request: {
        ...basePullRequestPayload().pull_request,
        merged: true,
        state: "closed",
      },
    });
    const result = await processGithubPullRequestWebhook(payload, "del-6");
    expect(mockTransition).toHaveBeenCalledWith(FEATURE_ID, "approved");
    expect(result).toMatchObject({ handled: true, linked: true });
  });

  it("returns hint when branch/tag does not link a feature", async () => {
    const payload = basePullRequestPayload({
      pull_request: {
        ...basePullRequestPayload().pull_request,
        head: { sha: "abc", ref: "feature/unrelated" },
        body: "no tag",
      },
    });
    const result = await processGithubPullRequestWebhook(payload, "del-7");
    expect(result).toMatchObject({ handled: true, linked: false });
    expect(result).toHaveProperty("hint");
  });
});

function basePushPayload(overrides: Record<string, unknown> = {}) {
  return {
    ref: `refs/heads/shipflow/${FEATURE_ID}`,
    before: "aaa111",
    after: "def456",
    deleted: false,
    installation: { id: 999 },
    repository: { id: 12345, full_name: "acme/core" },
    pusher: { name: "dev" },
    commits: [{ id: "def456", message: "fix: validation" }],
    ...overrides,
  };
}

describe("processGithubPushWebhook (production)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDuplicate.mockResolvedValue(false);
    installMocks.syncInstallationRepositoriesForOrg.mockResolvedValue(undefined);
    installMocks.dispatchWebhookPullRequestAiReview.mockResolvedValue({
      queued: true,
      workflowRunId: "wf-push",
    });
    dbMocks.orgFindFirst.mockResolvedValue({ id: ORG_ID });
    dbMocks.repoFindFirst.mockResolvedValue({ id: REPO_ROW_ID });
    dbMocks.featureFindFirst.mockResolvedValue({
      id: FEATURE_ID,
      organizationId: ORG_ID,
      status: "fix_needed",
    });
    dbMocks.pullRequestFindFirst.mockResolvedValue(null);
  });

  it("ignores non-shipflow branches", async () => {
    const result = await processGithubPushWebhook(
      basePushPayload({ ref: "refs/heads/main" }),
      "del-push-1",
    );
    expect(result).toMatchObject({ handled: true, linked: false, reason: "unlinked_branch" });
  });

  it("links push and queues AI review when open PR exists", async () => {
    dbMocks.pullRequestFindFirst.mockResolvedValueOnce({
      id: `${ORG_ID}-pr-777`,
      githubPrNumber: 8,
      state: "open",
    });

    const result = await processGithubPushWebhook(basePushPayload(), "del-push-2");

    expect(result).toMatchObject({
      handled: true,
      linked: true,
      featureId: FEATURE_ID,
      reviewQueued: true,
      prNumber: 8,
    });
    expect(mockAppend).toHaveBeenCalledWith(
      FEATURE_ID,
      expect.objectContaining({ title: "Feature branch updated" }),
    );
    expect(mockTransition).toHaveBeenCalledWith(FEATURE_ID, "pr_open");
    expect(installMocks.dispatchWebhookPullRequestAiReview).toHaveBeenCalledWith({
      pullRequestId: `${ORG_ID}-pr-777`,
      featureId: FEATURE_ID,
      headSha: "def456",
    });
    expect(dbMocks.mockUpdate).toHaveBeenCalled();
  });

  it("links push without PR and hints to open one", async () => {
    const result = await processGithubPushWebhook(basePushPayload(), "del-push-3");

    expect(result).toMatchObject({
      handled: true,
      linked: true,
      featureId: FEATURE_ID,
      reviewQueued: false,
    });
    expect(result).toHaveProperty("hint");
    expect(installMocks.dispatchWebhookPullRequestAiReview).not.toHaveBeenCalled();
  });

  it("skips branch deletion pushes", async () => {
    const result = await processGithubPushWebhook(
      basePushPayload({ deleted: true, after: "0000000000000000000000000000000000000000" }),
      "del-push-4",
    );
    expect(result).toMatchObject({ handled: true, linked: false, reason: "branch_deleted" });
  });
});

describe("processGithubInstallationWebhook (production)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDuplicate.mockResolvedValue(false);
  });

  it("clears org link and cache on installation deleted", async () => {
    dbMocks.orgFindFirst.mockResolvedValueOnce({ id: ORG_ID });
    const result = await processGithubInstallationWebhook(
      { action: "deleted", installation: { id: 999 } },
      "del-i1",
    );
    expect(result).toMatchObject({ handled: true, action: "deleted", installationId: "999" });
    expect(mockInvalidate).toHaveBeenCalledWith("999");
    expect(dbMocks.mockUpdate).toHaveBeenCalled();
  });

  it("removes repos on installation_repositories removed", async () => {
    dbMocks.orgFindFirst.mockResolvedValueOnce({ id: ORG_ID });
    const result = await processGithubInstallationWebhook(
      {
        action: "removed",
        installation: { id: 999 },
        repositories_removed: [{ id: 555, full_name: "acme/old" }],
      },
      "del-i2",
    );
    expect(result).toMatchObject({ handled: true, action: "removed" });
    expect(dbMocks.mockDelete).toHaveBeenCalled();
  });
});
