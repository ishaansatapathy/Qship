import { z, zodUndefinedModel } from "../../schema";
import {
  createFeatureRequest,
  getFeatureRequest,
  getFeatureDeliveryView,
  getPipelineSummary,
  getWorkspaceProjectForUser,
  listFeatureRequests,
  saveFeaturePrd,
  updateFeatureMetadata,
  updateFeatureStatus,
} from "@repo/services/feature-request";
import { generateFeaturePrd, triageFeatureRequest } from "@repo/services/feature-ai";
import { isOpenAiConfigured } from "@repo/services/ai/openai";
import { ServiceError } from "@repo/services/errors";
import { FEATURE_STATUSES } from "@repo/services/workflow";
import { mapServiceError, protectedProcedure, publicProcedure, router } from "../../trpc";

export const featureRouter = router({
  listStatuses: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/statuses",
        tags: ["Feature Requests"],
        summary: "List pipeline statuses and core loop description",
      },
    })
    .input(zodUndefinedModel)
    .query(() => ({
    statuses: FEATURE_STATUSES,
    coreLoop:
      "Feature Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship",
  })),

  workspace: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/workspace",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Get authenticated user's workspace (org + project)",
      },
    })
    .input(zodUndefinedModel)
    .query(async ({ ctx }) => {
    try {
      const ws = await getWorkspaceProjectForUser(ctx.user.id);
      if (!ws) return null;
      return {
        organizationId: ws.organization.id,
        organizationName: ws.organization.name,
        projectId: ws.project.id,
        projectName: ws.project.name,
        role: ws.role,
      };
    } catch (error) {
      mapServiceError(error);
    }
  }),

  pipelineSummary: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/pipeline-summary",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Counts of features by pipeline stage",
      },
    })
    .input(zodUndefinedModel)
    .query(async ({ ctx }) => {
    try {
      const ws = await getWorkspaceProjectForUser(ctx.user.id);
      if (!ws) {
        return {
          total: 0,
          submitted: 0,
          inDelivery: 0,
          awaitingApproval: 0,
          shipped: 0,
          needsAttention: 0,
        };
      }
      return getPipelineSummary(ws.project.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests",
        tags: ["Feature Requests"],
        protect: true,
        summary: "List feature requests in the user's project",
      },
    })
    .input(z.object({ projectId: z.string().min(1).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        const projectId = input?.projectId ?? ws?.project.id;
        if (!projectId) return [];
        return listFeatureRequests(projectId);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Get a feature request with PRD, tasks, and clarifications",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
    try {
      return await getFeatureRequest(input.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  delivery: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/delivery",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Delivery timeline, plain-language summary, and next step",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
    try {
      return await getFeatureDeliveryView(input.id, ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Submit a new feature request (optional AI triage)",
      },
    })
    .input(
      z.object({
        organizationId: z.string().min(1).optional(),
        projectId: z.string().min(1).optional(),
        title: z.string().min(3),
        rawRequest: z.string().min(10),
        source: z
          .enum(["manual", "email", "support_ticket", "customer_call", "api"])
          .optional(),
        runTriage: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        if (!ws && (!input.organizationId || !input.projectId)) {
          throw new ServiceError("FORBIDDEN", "Join a workspace before submitting requests");
        }

        const row = await createFeatureRequest({
          organizationId: input.organizationId ?? ws!.organization.id,
          projectId: input.projectId ?? ws!.project.id,
          title: input.title,
          rawRequest: input.rawRequest,
          createdByUserId: ctx.user.id,
          source: input.source,
        });

        const shouldTriage = input.runTriage !== false && isOpenAiConfigured();
        if (!shouldTriage) return row;

        const triage = await triageFeatureRequest({
          title: row.title,
          rawRequest: row.rawRequest,
        });

        return updateFeatureMetadata(row.id, { triage });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  generatePrd: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/prd",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Generate AI PRD and move feature to prd_ready",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const feature = await getFeatureRequest(input.id);
        await updateFeatureStatus(input.id, "prd_generating");

        const content = await generateFeaturePrd({
          title: feature.title,
          rawRequest: feature.rawRequest,
        });

        const prd = await saveFeaturePrd(input.id, content);
        await updateFeatureStatus(input.id, "prd_ready");

        return { featureId: input.id, prd };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateStatus: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/feature/requests/{id}/status",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Move a feature request to a new pipeline status",
      },
    })
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(FEATURE_STATUSES as unknown as [string, ...string[]]),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return updateFeatureStatus(
          input.id,
          input.status as (typeof FEATURE_STATUSES)[number],
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
