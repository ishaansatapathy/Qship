import type { Request, Response } from "express";
import { logger } from "@repo/logger";

import { applyPlanUpgrade } from "./apply-upgrade";
import { assertWebhookPaymentMatchesPlan } from "./order-verify";
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

  if (eventName === "payment.captured" && payment?.order_id && payment.id) {
    const orgId = payment.notes?.organizationId?.trim();
    if (!orgId) {
      logger.warn("razorpay.webhook.missing_org", { paymentId: payment.id });
      return res.json({ received: true });
    }

    try {
      const planTier = assertWebhookPaymentMatchesPlan(payment, orgId);
      await applyPlanUpgrade(orgId, planTier, payment.id);
      logger.info("Razorpay payment applied plan upgrade", { orgId, planTier, paymentId: payment.id });
    } catch (error) {
      logger.warn("razorpay.webhook.plan_apply_rejected", {
        orgId,
        paymentId: payment.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return res.json({ received: true });
}
