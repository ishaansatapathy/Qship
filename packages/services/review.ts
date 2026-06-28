import { desc, eq } from "@repo/database";
import db from "@repo/database";
import {
  aiReviewIssues,
  aiReviews,
  humanApprovals,
  organizations,
  type PrdContent,
} from "@repo/database/schema";

import { ServiceError } from "./errors";
import { appendFeatureActivity, updateFeatureStatus } from "./feature-request";
import type { PrAiReviewResult } from "./feature-ai";

export async function getAiReviewCredits(organizationId: string): Promise<number> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { aiReviewCredits: true, planTier: true },
  });
  return org?.aiReviewCredits ?? 0;
}

export async function consumeAiReviewCredit(organizationId: string): Promise<number> {
  const credits = await getAiReviewCredits(organizationId);
  if (credits <= 0) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "No AI review credits remaining. Upgrade your plan in Billing.",
    );
  }
  await db
    .update(organizations)
    .set({
      aiReviewCredits: credits - 1,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
  return credits - 1;
}

export async function persistAiReview(input: {
  featureRequestId: string;
  pullRequestId: string;
  review: PrAiReviewResult;
  prd?: PrdContent | null;
}) {
  const prior = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, input.featureRequestId),
    columns: { iteration: true },
    orderBy: [desc(aiReviews.createdAt)],
    limit: 1,
  });
  const iteration = (prior[0]?.iteration ?? 0) + 1;
  const reviewId = crypto.randomUUID();

  await db.insert(aiReviews).values({
    id: reviewId,
    featureRequestId: input.featureRequestId,
    pullRequestId: input.pullRequestId,
    iteration,
    summary: input.review.summary,
    readyForHuman: input.review.pass,
    rawAnalysis: input.review as unknown as Record<string, unknown>,
  });

  if (input.review.issues.length) {
    await db.insert(aiReviewIssues).values(
      input.review.issues.map((issue) => ({
        id: crypto.randomUUID(),
        aiReviewId: reviewId,
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        description: issue.description,
        filePath: issue.filePath ?? null,
        lineNumber: issue.lineNumber ?? null,
        requirementRef: issue.requirementRef ?? null,
        resolved: false,
      })),
    );
  }

  const nextStatus = input.review.pass ? "human_review" : "fix_needed";
  await updateFeatureStatus(input.featureRequestId, nextStatus);

  await appendFeatureActivity(input.featureRequestId, {
    kind: "ai_review",
    title: input.review.pass
      ? `AI review passed (iteration ${iteration})`
      : `AI review — ${input.review.issues.filter((i) => i.severity === "blocking").length} blocking issue(s)`,
    detail: input.review.summary,
    actor: "agent",
  });

  return { reviewId, iteration, nextStatus };
}

export async function listAiReviewsForFeature(featureRequestId: string) {
  return db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: true, pullRequest: true },
  });
}

export async function recordHumanApproval(input: {
  featureRequestId: string;
  reviewerUserId: string;
  decision: "approved" | "rejected" | "changes_requested";
  notes?: string;
}) {
  const id = crypto.randomUUID();
  await db.insert(humanApprovals).values({
    id,
    featureRequestId: input.featureRequestId,
    reviewerUserId: input.reviewerUserId,
    decision: input.decision,
    notes: input.notes ?? null,
  });

  if (input.decision === "approved") {
    await updateFeatureStatus(input.featureRequestId, "approved");
    await appendFeatureActivity(input.featureRequestId, {
      kind: "human_review",
      title: "Human approval granted",
      detail: input.notes,
      actor: "user",
    });
  } else if (input.decision === "rejected") {
    await updateFeatureStatus(input.featureRequestId, "rejected");
    await appendFeatureActivity(input.featureRequestId, {
      kind: "human_review",
      title: "Release rejected",
      detail: input.notes,
      actor: "user",
    });
  } else {
    await updateFeatureStatus(input.featureRequestId, "fix_needed");
    await appendFeatureActivity(input.featureRequestId, {
      kind: "human_review",
      title: "Changes requested",
      detail: input.notes,
      actor: "user",
    });
  }

  return { id, decision: input.decision };
}

export async function markFeatureShipped(featureRequestId: string, userId: string) {
  await updateFeatureStatus(featureRequestId, "shipped");
  await appendFeatureActivity(featureRequestId, {
    kind: "status",
    title: "Feature shipped",
    actor: "user",
  });
  await db.insert(humanApprovals).values({
    id: crypto.randomUUID(),
    featureRequestId,
    reviewerUserId: userId,
    decision: "approved",
    notes: "Shipped to production",
  });
}
