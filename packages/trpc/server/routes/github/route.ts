import { z, zodUndefinedModel } from "../../schema";
import {
  buildGithubInstallUrl,
  disconnectGithubForUser,
  getGithubConnectionForUser,
  isGithubAppConfigured,
  listGithubRepositoriesForUser,
  syncGithubInstallationForUser,
} from "@repo/services/github";
import { getMembershipForUser, ensurePersonalWorkspace } from "@repo/services/organization";
import { mapServiceError, protectedProcedure, router } from "../../trpc";

export const githubRouter = router({
  connectionStatus: protectedProcedure.input(zodUndefinedModel).query(async ({ ctx }) => {
    try {
      return await getGithubConnectionForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  getInstallUrl: protectedProcedure
    .input(z.object({ returnTo: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const configured = isGithubAppConfigured();
        const membership =
          (await getMembershipForUser(ctx.user.id)) ??
          (await ensurePersonalWorkspace(ctx.user.id, ctx.user.displayName));
        if (!membership) {
          return { url: null as string | null, configured };
        }

        if (!configured) {
          return { url: null as string | null, configured: false };
        }

        const url = buildGithubInstallUrl({
          organizationId: membership.organizationId,
          returnTo: input?.returnTo ?? "/settings",
        });

        return { url, configured: true };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listRepositories: protectedProcedure.input(zodUndefinedModel).query(async ({ ctx }) => {
    try {
      const repos = await listGithubRepositoriesForUser(ctx.user.id);
      return repos.map((repo) => ({
        id: repo.id,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch,
        owner: repo.owner,
        name: repo.name,
      }));
    } catch (error) {
      mapServiceError(error);
    }
  }),

  disconnect: protectedProcedure.input(zodUndefinedModel).mutation(async ({ ctx }) => {
    try {
      return await disconnectGithubForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  syncInstallation: protectedProcedure.input(zodUndefinedModel).mutation(async ({ ctx }) => {
    try {
      return await syncGithubInstallationForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});
