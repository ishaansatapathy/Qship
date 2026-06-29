import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations } from "@repo/database/schema";

import { ServiceError } from "../errors";
import { ensurePersonalWorkspace, getMembershipForUser } from "../organization";

import { applyPlanUpgrade } from "./apply-upgrade";
import { resolveVerifiedPlanTierFromOrder } from "./order-verify";
import {
  BILLING_PLANS,
  BILLING_PLAN_LIST,
  getVisibleBillingPlans,
  type PlanTier,
} from "./plans";
import { getRazorpayAuthHeader, verifyRazorpayPaymentSignature } from "./razorpay";

export { verifyRazorpayPaymentSignature } from "./razorpay";
export { handleRazorpayWebhook } from "./webhook";
export { assertRazorpayOrderMatchesPlan } from "./order-verify";

export { BILLING_PLANS, BILLING_PLAN_LIST, getVisibleBillingPlans, type PlanTier };

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

function assertBillingAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new ServiceError("FORBIDDEN", "Only workspace admins can change billing");
  }
}

export async function getBillingSummary(userId: string, displayName?: string | null) {
  const membership =
    (await getMembershipForUser(userId)) ?? (await ensurePersonalWorkspace(userId, displayName));

  const org = membership.organization;
  const plan = BILLING_PLANS[org.planTier as PlanTier] ?? BILLING_PLANS.free;

  return {
    organizationId: org.id,
    organizationName: org.name,
    planTier: org.planTier,
    planName: plan.name,
    priceInr: plan.priceInr,
    aiReviewCredits: org.aiReviewCredits,
    repositoryLimit: org.repositoryLimit,
    billingStatus: org.billingStatus,
    razorpayConfigured: isRazorpayConfigured(),
    plans: getVisibleBillingPlans(),
  };
}

export async function upgradeOrganizationPlan(
  userId: string,
  planTier: PlanTier,
  displayName?: string | null,
) {
  const membership =
    (await getMembershipForUser(userId)) ?? (await ensurePersonalWorkspace(userId, displayName));
  assertBillingAdmin(membership.role);

  const plan = BILLING_PLANS[planTier];
  if (!plan) {
    throw new ServiceError("BAD_REQUEST", "Invalid plan");
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (planTier !== "free" && keyId && keySecret) {
    getRazorpayAuthHeader();
    const amountPaise = plan.priceInr * 100;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: getRazorpayAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `shipflow_${membership.organizationId}_${Date.now()}`,
        notes: { organizationId: membership.organizationId, planTier },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceError("INTERNAL", `Razorpay order failed: ${text.slice(0, 200)}`);
    }

    const order = (await response.json()) as { id: string; amount: number; currency: string };
    return {
      mode: "razorpay" as const,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      planTier,
      planName: plan.name,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
    };
  }

  if (planTier !== "free" && process.env.NODE_ENV === "production") {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "Razorpay checkout is required for paid plans in production",
    );
  }

  await applyPlanUpgrade(membership.organization.id, planTier);

  return {
    mode: "demo" as const,
    planTier,
    planName: plan.name,
    aiReviewCredits: plan.aiReviewCredits,
    repositoryLimit: plan.repositoryLimit,
  };
}

export async function confirmRazorpayUpgrade(
  userId: string,
  _planTier: PlanTier,
  input: { orderId: string; paymentId: string; signature: string },
) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before managing billing");
  }
  assertBillingAdmin(membership.role);

  if (!verifyRazorpayPaymentSignature(input.orderId, input.paymentId, input.signature)) {
    throw new ServiceError("BAD_REQUEST", "Invalid Razorpay payment signature");
  }

  const org = membership.organization;
  const verifiedPlanTier = await resolveVerifiedPlanTierFromOrder(input.orderId, org.id);
  const plan = BILLING_PLANS[verifiedPlanTier];

  if (org.razorpayCustomerId === input.paymentId && org.planTier === verifiedPlanTier) {
    return { planTier: verifiedPlanTier, planName: plan.name };
  }

  try {
    await applyPlanUpgrade(org.id, verifiedPlanTier, input.paymentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("plan_tier") || message.includes("invalid input value for enum")) {
      throw new ServiceError(
        "INTERNAL",
        "Payment received but plan activation failed — run database migration 0052_plan_tier_test, then retry.",
      );
    }
    throw error;
  }

  return { planTier: verifiedPlanTier, planName: plan.name };
}
