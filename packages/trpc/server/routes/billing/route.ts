import { z, zodUndefinedModel } from "../../schema";

import {
  confirmRazorpayUpgrade,
  getBillingSummary,
  upgradeOrganizationPlan,
  type PlanTier,
} from "@repo/services/billing";
import { mapServiceError, protectedProcedure, router } from "../../trpc";

export const billingRouter = router({
  summary: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/billing/summary",
        tags: ["Billing"],
        protect: true,
        summary: "Current plan, credits, and available tiers",
      },
    })
    .input(zodUndefinedModel)
    .query(async ({ ctx }) => {
      try {
        return await getBillingSummary(ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  createCheckout: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/billing/checkout",
        tags: ["Billing"],
        protect: true,
        summary: "Start Razorpay checkout or demo-upgrade a plan",
      },
    })
    .input(z.object({ planTier: z.enum(["free", "pro", "enterprise"]) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await upgradeOrganizationPlan(ctx.user.id, input.planTier as PlanTier);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  confirmPayment: protectedProcedure
    .input(
      z.object({
        planTier: z.enum(["pro", "enterprise"]),
        paymentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmRazorpayUpgrade(ctx.user.id, input.planTier as PlanTier, input.paymentId);
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
