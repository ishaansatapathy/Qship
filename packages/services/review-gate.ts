import { desc, eq, and } from "@repo/database";
import db from "@repo/database";
import { aiReviews, humanApprovals } from "@repo/database/schema";

import { logger } from "@repo/logger";

import { ServiceError } from "./errors";
import { getFeatureRequest } from "./feature-request";
import type { FeatureStatus } from "./workflow";
import { isProductionEnv } from "./runtime-env";

export type HumanApprovalEligibility = {
  eligible: boolean;
  reason?: string;
  blockingCount?: number;
  status: FeatureStatus;
};

type LatestReviewForGate = {
  readyForHuman: boolean;
  issues: Array<{ severity: string; resolved: boolean }>;
  rawAnalysis: unknown;
};

/** Pure gate evaluation — used by UI, agents, and unit tests. */
export function evaluateHumanApprovalEligibility(input: {
  status: FeatureStatus;
  latestReview: LatestReviewForGate | null;
  isProduction: boolean;
}): HumanApprovalEligibility {
  if (input.status !== "human_review") {
    return {
      eligible: false,
      status: input.status,
      reason: `Cannot approve: feature is "${input.status}", expected "human_review".`,
    };
  }

  if (!input.latestReview) {
    return {
      eligible: false,
      status: input.status,
      reason: "Cannot approve: no AI review has been run on this feature yet.",
    };
  }

  const unresolvedBlocking = input.latestReview.issues.filter(
    (i) => i.severity === "blocking" && !i.resolved,
  );
  if (!input.latestReview.readyForHuman || unresolvedBlocking.length > 0) {
    const blockingCount =
      unresolvedBlocking.length ||
      input.latestReview.issues.filter((i) => i.severity === "blocking").length;
    return {
      eligible: false,
      status: input.status,
      blockingCount,
      reason: `Cannot approve: AI review has ${blockingCount} unresolved blocking issue(s). Resolve them and re-run the AI review if needed.`,
    };
  }

  const rawAnalysis = input.latestReview.rawAnalysis as { demoOnly?: boolean } | null;
  if (input.isProduction && rawAnalysis?.demoOnly) {
    return {
      eligible: false,
      status: input.status,
      reason:
        "Cannot approve: AI review was seeded for demo only. Run a real AI review before approval.",
    };
  }

  return { eligible: true, status: input.status, blockingCount: 0 };
}

export async function getLatestAiReview(featureRequestId: string) {
  return db.query.aiReviews.findFirst({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    orderBy: [desc(aiReviews.createdAt)],
    with: { issues: true },
  });
}

/** Single fetch for gate reads — avoids duplicate DB round-trips on approve. */
export async function loadHumanApprovalGateContext(featureRequestId: string) {
  const feature = await getFeatureRequest(featureRequestId);
  const latestReview = await getLatestAiReview(featureRequestId);
  const eligibility = evaluateHumanApprovalEligibility({
    status: feature.status as FeatureStatus,
    latestReview: latestReview
      ? {
          readyForHuman: latestReview.readyForHuman,
          issues: latestReview.issues,
          rawAnalysis: latestReview.rawAnalysis,
        }
      : null,
    isProduction: isProductionEnv(),
  });
  return { feature, latestReview, eligibility };
}

/** Non-throwing eligibility check for UI and read APIs. */
export async function getHumanApprovalEligibility(
  featureRequestId: string,
): Promise<HumanApprovalEligibility> {
  const { eligibility } = await loadHumanApprovalGateContext(featureRequestId);
  return eligibility;
}

/** Validates approval eligibility; returns latest review in one load. */
export async function validateHumanApprovalEligibility(featureRequestId: string) {
  const { latestReview, eligibility } = await loadHumanApprovalGateContext(featureRequestId);
  if (!eligibility.eligible) {
    throw new ServiceError("PRECONDITION_FAILED", eligibility.reason ?? "Not eligible for approval");
  }
  if (!latestReview) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Cannot approve: no AI review has been run on this feature yet.",
    );
  }
  return latestReview;
}

export async function findLatestApprovedDecision(featureRequestId: string) {
  return db.query.humanApprovals.findFirst({
    where: and(
      eq(humanApprovals.featureRequestId, featureRequestId),
      eq(humanApprovals.decision, "approved"),
    ),
    orderBy: [desc(humanApprovals.createdAt)],
  });
}

/** Resolves idempotent approve after race without phantom audit rows. */
export async function resolveIdempotentApprovedDecision(featureRequestId: string) {
  const existing = await findLatestApprovedDecision(featureRequestId);
  if (existing) {
    logger.info("review.human_approval_idempotent", {
      featureRequestId,
      approvalId: existing.id,
    });
    return {
      id: existing.id,
      decision: "approved" as const,
      nextStatus: "approved" as const,
      slack: undefined,
      idempotent: true as const,
    };
  }
  throw new ServiceError(
    "CONFLICT",
    "Feature is approved but no approval record exists — data inconsistency detected.",
  );
}
