import type { Request, Response } from "express";
import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { BILLING_PLANS, type PlanTier } from "./plans";
import {
  logRazorpayWebhook,
  parseRazorpayWebhook,
  verifyRazorpayWebhookSignature,
} from "./razorpay";

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body ?? {});

  if (typeof signature !== "string" || !verifyRazorpayWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const event = parseRazorpayWebhook(payload);
  const eventName = event?.event ?? "unknown";
  const payment = event?.payload?.payment?.entity;
  logRazorpayWebhook(eventName, payment?.id);

  if (eventName === "payment.captured" && payment?.order_id) {
    const orgId = payment.notes?.organizationId;
    const planTier = payment.notes?.planTier as PlanTier | undefined;
    if (orgId && planTier && BILLING_PLANS[planTier]) {
      const plan = BILLING_PLANS[planTier];
      await db
        .update(organizations)
        .set({
          planTier,
          aiReviewCredits: String(plan.aiReviewCredits),
          repositoryLimit: String(plan.repositoryLimit),
          billingStatus: "active",
          razorpayCustomerId: payment.id,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, orgId));
      logger.info("Razorpay payment applied plan upgrade", { orgId, planTier });
    }
  }

  return res.json({ received: true });
}
