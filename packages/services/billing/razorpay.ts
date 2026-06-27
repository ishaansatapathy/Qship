import crypto from "node:crypto";

import { logger } from "@repo/logger";

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

export function getRazorpayPublicKeyId() {
  return process.env.RAZORPAY_KEY_ID?.trim() ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() ?? "";
}

export type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        notes?: { organizationId?: string; planTier?: string };
      };
    };
  };
};

export function parseRazorpayWebhook(body: unknown): RazorpayWebhookPayload | null {
  if (!body || typeof body !== "object") return null;
  return body as RazorpayWebhookPayload;
}

export function logRazorpayWebhook(event: string, paymentId?: string) {
  logger.info("Razorpay webhook received", { event, paymentId });
}
