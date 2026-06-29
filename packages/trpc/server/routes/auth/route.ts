import { TRPCError } from "@trpc/server";

import { getEnabledAuthProviders } from "@repo/auth";
import { getSettingsService } from "@repo/services/settings";

import { z, zodUndefinedModel } from "../../schema";
import { mapServiceError, protectedProcedure, mutationProcedure, publicProcedure, router } from "../../trpc";

/** ShipFlow session — BetterAuth handles sign-in on the web app. */
export const authRouter = router({
  me: protectedProcedure.input(zodUndefinedModel).query(async ({ ctx }) => {
    try {
      const approvalDefaults = await getSettingsService().getApprovalDefaults(ctx.user.id);
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        fullName: ctx.user.fullName,
        displayName: ctx.user.displayName,
        emailVerified: ctx.user.emailVerified,
        profileImageUrl: ctx.user.profileImageUrl,
        role: "user" as const,
        ...approvalDefaults,
        twoFactorEnabled: false,
      };
    } catch (error) {
      mapServiceError(error);
    }
  }),

  logout: protectedProcedure.input(zodUndefinedModel).mutation(async () => ({
    message: "Signed out",
  })),

  getSupportedAuthenticationProviders: publicProcedure
    .input(zodUndefinedModel)
    .query(() => getEnabledAuthProviders()),

  setupProfile: protectedProcedure
    .input(z.object({ fullName: z.string().min(1).optional(), displayName: z.string().optional() }).passthrough())
    .mutation(({ ctx, input }) => ({
      id: ctx.user.id,
      fullName: input.fullName ?? input.displayName ?? ctx.user.fullName,
      displayName: input.displayName ?? ctx.user.displayName,
      email: ctx.user.email,
    })),

  toggle2FA: mutationProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(() => {
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "Two-factor authentication is not available yet.",
      });
    }),
});
