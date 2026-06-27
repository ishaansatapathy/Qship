import { z, zodUndefinedModel } from "../../schema";
import {
  createFeatureRequest,
  getFeatureRequest,
  getFeatureDeliveryView,
  getPipelineSummary,
  getWorkspaceProjectForUser,
  listFeatureRequests,
  updateFeatureMetadata,
  updateFeatureStatus,
  assertFeatureInUserWorkspace,
} from "@repo/services/feature-request";
import { triageFeatureRequest } from "@repo/services/feature-ai";
import { dispatchAiReview, dispatchPrdGeneration, dispatchTaskGeneration } from "@repo/services/inngest/dispatch";
import { listWorkflowRunsForFeature } from "@repo/services/workflow-runs";
import { createFeaturePullRequest } from "@repo/services/github/pr";
import { getGithubConnectionForUser } from "@repo/services/github/installation";
import { listAiReviewsForFeature, markFeatureShipped, recordHumanApproval } from "@repo/services/review";
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
    .output(
      z.object({
        statuses: z.array(z.string()),
        coreLoop: z.string(),
      }),
    )
    .query(() => ({
      statuses: [...FEATURE_STATUSES],
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
        if (!projectId || !ws || projectId !== ws.project.id) {
          return [];
        }
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
    .query(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return feature;
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
        if (!ws) {
          throw new ServiceError("FORBIDDEN", "Join a workspace before submitting requests");
        }

        if (input.organizationId && input.organizationId !== ws.organization.id) {
          throw new ServiceError("FORBIDDEN", "Cannot create requests in another organization");
        }
        if (input.projectId && input.projectId !== ws.project.id) {
          throw new ServiceError("FORBIDDEN", "Cannot create requests in another project");
        }

        const row = await createFeatureRequest({
          organizationId: ws.organization.id,
          projectId: ws.project.id,
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
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchPrdGeneration(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listWorkflows: protectedProcedure
    .input(z.object({ featureId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.featureId);
        return listWorkflowRunsForFeature(input.featureId);
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
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return updateFeatureStatus(
          input.id,
          input.status as (typeof FEATURE_STATUSES)[number],
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  generateTasks: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/tasks",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Generate engineering tasks from PRD",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchTaskGeneration(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  runAiReview: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/ai-review",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Run AI review (uses PR diff when linked)",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchAiReview(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  createPullRequest: protectedProcedure
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

  approve: protectedProcedure
    .input(z.object({ id: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return recordHumanApproval({
          featureRequestId: input.id,
          reviewerUserId: ctx.user.id,
          decision: "approved",
          notes: input.notes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return recordHumanApproval({
          featureRequestId: input.id,
          reviewerUserId: ctx.user.id,
          decision: "changes_requested",
          notes: input.notes,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  ship: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return markFeatureShipped(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listReviews: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return listAiReviewsForFeature(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
