import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations } from "@repo/database/schema";

import { BILLING_PLANS, type PlanTier } from "./plans";

/** Apply a verified paid (or demo) plan upgrade to a workspace. */
export async function applyPlanUpgrade(
  organizationId: string,
  planTier: PlanTier,
  paymentId?: string | null,
) {
  const plan = BILLING_PLANS[planTier];
  await db
    .update(organizations)
    .set({
      planTier,
      aiReviewCredits: plan.aiReviewCredits,
      repositoryLimit: plan.repositoryLimit,
      billingStatus: "active",
      razorpayCustomerId: paymentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
}
