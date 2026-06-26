import { getEnabledAuthProviders } from "@repo/auth";

import { z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, publicProcedure, router } from "../../trpc";

/** ShipFlow session — BetterAuth handles sign-in on the web app. */
export const authRouter = router({
  me: protectedProcedure.input(zodUndefinedModel).query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    fullName: ctx.user.fullName,
    displayName: ctx.user.displayName,
    emailVerified: ctx.user.emailVerified,
    profileImageUrl: ctx.user.profileImageUrl,
    role: "user" as const,
    autoApproveEmail: false,
    autoApproveAgentEmail: false,
    autoApproveCalendar: false,
    twoFactorEnabled: false,
  })),

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

  toggle2FA: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => ({
      enabled: input.enabled,
      message: input.enabled ? "Two-factor authentication enabled" : "Two-factor authentication disabled",
    })),
});
