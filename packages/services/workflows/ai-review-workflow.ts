import { runFeatureAiReviewWithOptionalPr } from "../github/pr-review";
import { getMembershipForUser } from "../organization";
import { ServiceError } from "../errors";
import { updateWorkflowRun } from "../workflow-runs";

export async function runAiReviewWorkflow(input: {
  featureId: string;
  userId: string;
  workflowRunId: string;
}) {
  try {
    await updateWorkflowRun(input.workflowRunId, {
      status: "running",
      progress: 25,
      message: "Loading feature and PR context…",
    });

    const membership = await getMembershipForUser(input.userId);
    if (!membership) {
      throw new ServiceError("FORBIDDEN", "Join a workspace before running reviews");
    }

    await updateWorkflowRun(input.workflowRunId, {
      progress: 55,
      message: "Running AI QA review against PRD and diff…",
    });

    const result = await runFeatureAiReviewWithOptionalPr(input.featureId, membership.organizationId);

    await updateWorkflowRun(input.workflowRunId, {
      status: "completed",
      progress: 100,
      message: result.ok
        ? result.pass
          ? "AI review passed"
          : "AI review — fixes needed"
        : "Review skipped — connect GitHub or link a PR",
      result: {
        ok: result.ok,
        pass: "pass" in result ? result.pass : undefined,
        reviewId: "reviewId" in result ? result.reviewId : undefined,
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateWorkflowRun(input.workflowRunId, {
      status: "failed",
      progress: 100,
      message: "AI review failed",
      error: message,
    });
    throw error;
  }
}
