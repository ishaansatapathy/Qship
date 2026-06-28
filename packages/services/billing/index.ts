import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations } from "@repo/database/schema";

import { ServiceError } from "../errors";
import { ensurePersonalWorkspace, getMembershipForUser } from "../organization";

import { BILLING_PLANS, BILLING_PLAN_LIST, type PlanTier } from "./plans";
import { verifyRazorpayPaymentSignature } from "./razorpay";

export { verifyRazorpayPaymentSignature } from "./razorpay";
export { handleRazorpayWebhook } from "./webhook";

export { BILLING_PLANS, BILLING_PLAN_LIST, type PlanTier };

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
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
    plans: BILLING_PLAN_LIST,
  };
}

export async function upgradeOrganizationPlan(
  userId: string,
  planTier: PlanTier,
  displayName?: string | null,
) {
  const membership =
    (await getMembershipForUser(userId)) ?? (await ensurePersonalWorkspace(userId, displayName));
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ServiceError("FORBIDDEN", "Only workspace admins can change billing");
  }

  const plan = BILLING_PLANS[planTier];
  if (!plan) {
    throw new ServiceError("BAD_REQUEST", "Invalid plan");
  }

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (planTier !== "free" && keyId && keySecret) {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const amountPaise = plan.priceInr * 100;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
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

  await db
    .update(organizations)
    .set({
      planTier,
      aiReviewCredits: plan.aiReviewCredits,
      repositoryLimit: plan.repositoryLimit,
      billingStatus: "active",
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, membership.organization.id));

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
  planTier: PlanTier,
  input: { orderId: string; paymentId: string; signature: string },
) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before managing billing");
  }

  if (!verifyRazorpayPaymentSignature(input.orderId, input.paymentId, input.signature)) {
    throw new ServiceError("BAD_REQUEST", "Invalid Razorpay payment signature");
  }

  const plan = BILLING_PLANS[planTier];
  await db
    .update(organizations)
    .set({
      planTier,
      aiReviewCredits: plan.aiReviewCredits,
      repositoryLimit: plan.repositoryLimit,
      billingStatus: "active",
      razorpayCustomerId: input.paymentId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, membership.organization.id));

  return { planTier, planName: plan.name };
}
