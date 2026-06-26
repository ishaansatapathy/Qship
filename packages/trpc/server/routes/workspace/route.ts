import { zodUndefinedModel } from "../../schema";
import { getWorkspaceForUser } from "@repo/services/organization";
import { mapServiceError, protectedProcedure, router } from "../../trpc";

export const workspaceRouter = router({
  get: protectedProcedure.input(zodUndefinedModel).query(async ({ ctx }) => {
    try {
      return await getWorkspaceForUser(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});
