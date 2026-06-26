import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations } from "@repo/database/schema";

import { ServiceError } from "../errors";
import { getMembershipForUser } from "../organization";

export const BILLING_PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    priceInr: 0,
    aiReviewCredits: 10,
    repositoryLimit: 1,
    features: ["Pipeline overview", "10 AI reviews / month", "1 linked repo"],
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceInr: 999,
    aiReviewCredits: 100,
    repositoryLimit: 10,
    features: ["Unlimited feature requests", "100 AI reviews / month", "10 repos", "Priority support"],
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    priceInr: 4999,
    aiReviewCredits: 9999,
    repositoryLimit: 999,
    features: ["Unlimited reviews", "Unlimited repos", "SSO", "Dedicated support"],
  },
} as const;

export type PlanTier = keyof typeof BILLING_PLANS;

export async function getBillingSummary(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    return null;
  }

  const org = membership.organization;
  const plan = BILLING_PLANS[org.planTier as PlanTier] ?? BILLING_PLANS.free;
  const credits = Number.parseInt(org.aiReviewCredits, 10);
  const repoLimit = Number.parseInt(org.repositoryLimit, 10);

  return {
    organizationId: org.id,
    organizationName: org.name,
    planTier: org.planTier,
    planName: plan.name,
    priceInr: plan.priceInr,
    aiReviewCredits: Number.isFinite(credits) ? credits : 0,
    repositoryLimit: Number.isFinite(repoLimit) ? repoLimit : 1,
    billingStatus: org.billingStatus,
    razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID?.trim()),
    plans: Object.values(BILLING_PLANS),
  };
}

export async function upgradeOrganizationPlan(userId: string, planTier: PlanTier) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before managing billing");
  }
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
        receipt: `qship_${membership.organizationId}_${Date.now()}`,
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
    };
  }

  await db
    .update(organizations)
    .set({
      planTier,
      aiReviewCredits: String(plan.aiReviewCredits),
      repositoryLimit: String(plan.repositoryLimit),
      billingStatus: planTier === "free" ? "active" : "active",
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

export async function confirmRazorpayUpgrade(userId: string, planTier: PlanTier, paymentId?: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before managing billing");
  }

  const plan = BILLING_PLANS[planTier];
  await db
    .update(organizations)
    .set({
      planTier,
      aiReviewCredits: String(plan.aiReviewCredits),
      repositoryLimit: String(plan.repositoryLimit),
      billingStatus: "active",
      razorpayCustomerId: paymentId ?? membership.organization.razorpayCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, membership.organization.id));

  return { planTier, planName: plan.name };
}
