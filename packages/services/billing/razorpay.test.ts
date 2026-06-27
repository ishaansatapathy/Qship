import { describe, expect, it } from "vitest";

import { verifyRazorpayPaymentSignature } from "./razorpay";

describe("Razorpay payment signature", () => {
  it("rejects when key secret is missing", () => {
    const prev = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(verifyRazorpayPaymentSignature("order_1", "pay_1", "sig")).toBe(false);
    process.env.RAZORPAY_KEY_SECRET = prev;
  });
});
