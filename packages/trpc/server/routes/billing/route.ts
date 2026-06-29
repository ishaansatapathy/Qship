import { z, zodUndefinedModel } from "../../schema";

import {
  confirmRazorpayUpgrade,
  getBillingSummary,
  isRazorpayConfigured,
  upgradeOrganizationPlan,
  type PlanTier,
} from "@repo/services/billing";
import { billingStatusOutput, openApiResponse } from "../../openapi-outputs";
import { mapServiceError, protectedProcedure, mutationProcedure, router } from "../../trpc";

export const billingRouter = router({
  status: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/billing/status",
        tags: ["Billing"],
        protect: true,
        summary: "Billing configuration (Razorpay keys, workspace readiness)",
      },
    })
    .input(zodUndefinedModel)
    .output(billingStatusOutput).query(() => ({
      razorpayConfigured: isRazorpayConfigured(),
      ready: true,
    })),

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
    .output(openApiResponse).query(async ({ ctx }) => {
      try {
        return await getBillingSummary(ctx.user.id, ctx.user.displayName);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  createCheckout: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/billing/checkout",
        tags: ["Billing"],
        protect: true,
        summary: "Start Razorpay checkout or demo-upgrade a plan",
      },
    })
    .input(z.object({ planTier: z.enum(["free", "test", "pro", "enterprise"]) }))
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        return await upgradeOrganizationPlan(ctx.user.id, input.planTier as PlanTier, ctx.user.displayName);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  confirmPayment: mutationProcedure
    .input(
      z.object({
        planTier: z.enum(["test", "pro", "enterprise"]),
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        signature: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmRazorpayUpgrade(ctx.user.id, input.planTier as PlanTier, {
          orderId: input.orderId,
          paymentId: input.paymentId,
          signature: input.signature,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
