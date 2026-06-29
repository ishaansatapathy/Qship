import { ServiceError } from "../errors";

import { BILLING_PLANS, type PlanTier } from "./plans";
import { fetchRazorpayOrder, type RazorpayOrder } from "./razorpay";

export function assertRazorpayOrderMatchesPlan(
  order: RazorpayOrder,
  organizationId: string,
): PlanTier {
  const notesOrgId = order.notes?.organizationId?.trim();
  const notesTier = order.notes?.planTier?.trim() as PlanTier | undefined;

  if (!notesOrgId || notesOrgId !== organizationId) {
    throw new ServiceError("BAD_REQUEST", "Payment order does not belong to this workspace");
  }
  if (!notesTier || !(notesTier in BILLING_PLANS)) {
    throw new ServiceError("BAD_REQUEST", "Payment order is missing a valid plan");
  }

  const plan = BILLING_PLANS[notesTier];
  if (plan.priceInr <= 0) {
    throw new ServiceError("BAD_REQUEST", "Payment order targets a non-paid plan");
  }
  if (order.amount !== plan.priceInr * 100) {
    throw new ServiceError("BAD_REQUEST", "Payment amount does not match plan price");
  }
  if (order.currency !== "INR") {
    throw new ServiceError("BAD_REQUEST", "Unexpected payment currency");
  }
  if (order.status !== "paid") {
    throw new ServiceError("BAD_REQUEST", "Payment order is not paid yet");
  }

  return notesTier;
}

export function assertWebhookPaymentMatchesPlan(
  payment: { amount?: number; currency?: string; notes?: { organizationId?: string; planTier?: string } },
  organizationId: string,
): PlanTier {
  const notesOrgId = payment.notes?.organizationId?.trim();
  const notesTier = payment.notes?.planTier?.trim() as PlanTier | undefined;

  if (!notesOrgId || notesOrgId !== organizationId) {
    throw new ServiceError("BAD_REQUEST", "Webhook payment does not belong to this workspace");
  }
  if (!notesTier || !(notesTier in BILLING_PLANS)) {
    throw new ServiceError("BAD_REQUEST", "Webhook payment is missing a valid plan");
  }

  const plan = BILLING_PLANS[notesTier];
  if (payment.amount !== plan.priceInr * 100) {
    throw new ServiceError("BAD_REQUEST", "Webhook payment amount does not match plan price");
  }
  if (payment.currency !== "INR") {
    throw new ServiceError("BAD_REQUEST", "Unexpected webhook payment currency");
  }

  return notesTier;
}

export async function resolveVerifiedPlanTierFromOrder(
  orderId: string,
  organizationId: string,
): Promise<PlanTier> {
  const order = await fetchRazorpayOrder(orderId);
  return assertRazorpayOrderMatchesPlan(order, organizationId);
}
