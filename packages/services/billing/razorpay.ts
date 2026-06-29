import crypto from "node:crypto";

import { logger } from "@repo/logger";

import { ServiceError } from "../errors";

export function getRazorpayAuthHeader() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new ServiceError("PRECONDITION_FAILED", "Razorpay is not configured");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes?: Record<string, string>;
};

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: getRazorpayAuthHeader() },
  });
  if (!response.ok) {
    const text = await response.text();
    logger.warn("razorpay.order_fetch_failed", { orderId, status: response.status, text: text.slice(0, 200) });
    throw new ServiceError("BAD_REQUEST", "Could not verify Razorpay payment order");
  }
  return (await response.json()) as RazorpayOrder;
}

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
        amount?: number;
        currency?: string;
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
