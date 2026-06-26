import { zodUndefinedModel } from "../../schema";
import { getShipflowObservabilitySummary } from "@repo/services/shipflow-observability";
import { mapServiceError, protectedProcedure, router } from "../../trpc";

export const observabilityRouter = router({
  summary: protectedProcedure.input(zodUndefinedModel).query(async ({ ctx }) => {
    try {
      return await getShipflowObservabilitySummary(ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),
});
