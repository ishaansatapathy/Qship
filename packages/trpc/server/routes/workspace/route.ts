import { zodUndefinedModel } from "../../schema";
import { getWorkspaceForUser } from "@repo/services/organization";
import { mapServiceError, protectedProcedure, router } from "../../trpc";

export const workspaceRouter = router({
  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/workspace",
        tags: ["Workspace"],
        protect: true,
        summary: "Get organization membership and project for the authenticated user",
      },
    })
    .input(zodUndefinedModel)
    .query(async ({ ctx }) => {
    try {
      return await getWorkspaceForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});
