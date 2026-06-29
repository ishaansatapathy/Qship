import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateWorkflowRun = vi.fn();
const mockListWorkflowRuns = vi.fn();
const mockUpdateWorkflowRun = vi.fn();
const mockRunPullRequestAiReview = vi.fn();

vi.mock("../workflow-runs", () => ({
  createWorkflowRun: (...args: unknown[]) => mockCreateWorkflowRun(...args),
  listWorkflowRunsForFeature: (...args: unknown[]) => mockListWorkflowRuns(...args),
  updateWorkflowRun: (...args: unknown[]) => mockUpdateWorkflowRun(...args),
}));

vi.mock("./pr-review", () => ({
  runPullRequestAiReview: (...args: unknown[]) => mockRunPullRequestAiReview(...args),
}));

import { dispatchWebhookPullRequestAiReview } from "./webhook-pr-review-dispatch";

describe("dispatchWebhookPullRequestAiReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListWorkflowRuns.mockResolvedValue([]);
    mockCreateWorkflowRun.mockResolvedValue({ id: "wf-webhook-1" });
    mockRunPullRequestAiReview.mockResolvedValue({ ok: true, pass: true });
    mockUpdateWorkflowRun.mockResolvedValue({});
  });

  it("queues a background workflow run for webhook PR reviews", async () => {
    const result = await dispatchWebhookPullRequestAiReview({
      pullRequestId: "pr-1",
      featureId: "feat-1",
      headSha: "abc123def456",
    });

    expect(result.queued).toBe(true);
    expect(result.workflowRunId).toBe("wf-webhook-1");
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        featureRequestId: "feat-1",
        type: "ai_review",
      }),
    );
  });

  it("dedupes when the same head sha is already queued", async () => {
    mockListWorkflowRuns.mockResolvedValueOnce([
      {
        id: "wf-existing",
        type: "ai_review",
        status: "running",
        message: "Webhook PR review queued (abc123def456)…",
      },
    ]);

    const result = await dispatchWebhookPullRequestAiReview({
      pullRequestId: "pr-1",
      featureId: "feat-1",
      headSha: "abc123def456",
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("duplicate_head_sha");
    expect(mockCreateWorkflowRun).not.toHaveBeenCalled();
  });
});
