import { describe, expect, it } from "vitest";

import { assertRazorpayOrderMatchesPlan, assertWebhookPaymentMatchesPlan } from "./order-verify";
import type { RazorpayOrder } from "./razorpay";

describe("Razorpay order verification", () => {
  const proOrder: RazorpayOrder = {
    id: "order_pro",
    amount: 99900,
    currency: "INR",
    status: "paid",
    notes: { organizationId: "org_1", planTier: "pro" },
  };

  it("accepts a matching paid order", () => {
    expect(assertRazorpayOrderMatchesPlan(proOrder, "org_1")).toBe("pro");
  });

  it("rejects plan tier tampering", () => {
    expect(() =>
      assertRazorpayOrderMatchesPlan(
        {
          ...proOrder,
          amount: 1000,
          notes: { organizationId: "org_1", planTier: "enterprise" },
        },
        "org_1",
      ),
    ).toThrow(/amount does not match/i);
  });

  it("rejects wrong workspace", () => {
    expect(() => assertRazorpayOrderMatchesPlan(proOrder, "org_2")).toThrow(/workspace/i);
  });

  it("rejects unpaid orders", () => {
    expect(() =>
      assertRazorpayOrderMatchesPlan({ ...proOrder, status: "created" }, "org_1"),
    ).toThrow(/not paid/i);
  });

  it("validates webhook payment amount and notes", () => {
    expect(
      assertWebhookPaymentMatchesPlan(
        {
          amount: 1000,
          currency: "INR",
          notes: { organizationId: "org_1", planTier: "test" },
        },
        "org_1",
      ),
    ).toBe("test");
  });
});
