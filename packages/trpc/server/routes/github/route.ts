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
import {
  githubInstallUrlOutput,
  githubConnectionOutput,
  githubRepoListOutput,
} from "../../openapi-outputs";
import { mapServiceError, protectedProcedure, mutationProcedure, router } from "../../trpc";

export const githubRouter = router({
  connectionStatus: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/github/connection",
        tags: ["GitHub"],
        protect: true,
        summary: "GitHub App connection status for the workspace",
      },
    })
    .input(zodUndefinedModel)
    .output(githubConnectionOutput).query(async ({ ctx }) => {
    try {
      return await getGithubConnectionForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  getInstallUrl: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/github/install-url",
        tags: ["GitHub"],
        protect: true,
        summary: "GitHub App installation URL for the workspace",
      },
    })
    .input(z.object({ returnTo: z.string().optional() }).optional())
    .output(githubInstallUrlOutput).query(async ({ ctx, input }) => {
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

  listRepositories: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/github/repositories",
        tags: ["GitHub"],
        protect: true,
        summary: "List GitHub repositories linked to the workspace",
      },
    })
    .input(zodUndefinedModel)
    .output(githubRepoListOutput).query(async ({ ctx }) => {
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

  disconnect: mutationProcedure.input(zodUndefinedModel).mutation(async ({ ctx }) => {
    try {
      return await disconnectGithubForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  syncInstallation: mutationProcedure.input(zodUndefinedModel).mutation(async ({ ctx }) => {
    try {
      return await syncGithubInstallationForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});
