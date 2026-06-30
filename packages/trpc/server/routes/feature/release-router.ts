/**
 * Release sub-router — createPullRequest, ship.
 * Separated because release concerns (GitHub PR creation, ship gate enforcement)
 * are distinct from review loop and approval decisions.
 */
import { z } from "../../schema";
import { assertFeatureInUserWorkspace } from "@repo/services/feature-request";
import { assertReleaseReviewer } from "@repo/services/workflow-guards";
import { markFeatureShipped } from "@repo/services/review";
import { getGithubConnectionForUser } from "@repo/services/github/installation";
import { createFeaturePullRequest } from "@repo/services/github/pr";
import { ServiceError } from "@repo/services/errors";
import { openApiResponse } from "../../openapi-outputs";
import { mapServiceError, mutationProcedure } from "../../trpc";

export const releaseFeatureProcedures = {
  createPullRequest: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/pull-request",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Open a GitHub PR linked to this feature (branch shipflow/<uuid>)",
      },
    })
    .input(z.object({ id: z.string().min(1), repositoryId: z.string().min(1) }))
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        const { ws } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        const gh = await getGithubConnectionForUser(ctx.user.id);
        if (!gh.connected || !gh.installationId) {
          throw new ServiceError("PRECONDITION_FAILED", "Connect GitHub in Settings first");
        }
        return createFeaturePullRequest({
          organizationId: ws.organization.id,
          installationId: gh.installationId,
          featureId: input.id,
          repositoryId: input.repositoryId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  ship: mutationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertReleaseReviewer(ctx.user.id, input.id);
        return markFeatureShipped(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),
};
