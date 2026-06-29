import { ServiceError } from "./errors";
import { assertFeatureInUserWorkspace } from "./feature-request";

const RELEASE_REVIEWER_ROLES = new Set(["owner", "admin"]);

export { RELEASE_REVIEWER_ROLES };

/**
 * Ensures the user may approve or ship a feature (separation of duties + role gate).
 * Demo mode allows the submitter to approve when they are the only judge account.
 */
export async function assertReleaseReviewer(userId: string, featureId: string) {
  const { ws, feature } = await assertFeatureInUserWorkspace(userId, featureId);

  if (!RELEASE_REVIEWER_ROLES.has(ws.role)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Only workspace owners or admins can approve or ship releases.",
    );
  }

  const demoMode = process.env.DEMO_LOGIN_ENABLED === "true";
  if (!demoMode && feature.createdByUserId && feature.createdByUserId === userId) {
    throw new ServiceError(
      "FORBIDDEN",
      "Submitter cannot approve or ship their own feature — another reviewer is required.",
    );
  }

  return { ws, feature };
}

export async function assertReviewIssueInUserWorkspace(userId: string, issueId: string) {
  const { eq } = await import("@repo/database");
  const db = (await import("@repo/database")).default;
  const { aiReviewIssues } = await import("@repo/database/schema");

  const issue = await db.query.aiReviewIssues.findFirst({
    where: eq(aiReviewIssues.id, issueId),
    with: {
      aiReview: { columns: { featureRequestId: true, id: true, iteration: true } },
    },
  });

  if (!issue?.aiReview?.featureRequestId) {
    throw new ServiceError("NOT_FOUND", "AI review issue not found");
  }

  if (userId) {
    await assertFeatureInUserWorkspace(userId, issue.aiReview.featureRequestId);
  }

  return issue;
}
