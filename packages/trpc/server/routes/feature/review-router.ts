/**
 * AI Review sub-router — runAiReview, listReviews, review delta/stats/health,
 * issue resolution. All procedures live here to keep the main route.ts focused
 * on CRUD, intake, and pipeline orchestration.
 */
import { z } from "../../schema";
import {
  assertFeatureInUserWorkspace,
  assertAiReviewInUserWorkspace,
  appendFeatureActivity,
} from "@repo/services/feature-request";
import { dispatchAiReview } from "@repo/services/inngest/dispatch";
import {
  listAiReviewsForFeature,
  getReviewDelta,
  getReviewStats,
  getReviewLoopHealth,
  resolveReviewIssue,
  getIssueResolutionSummary,
} from "@repo/services/review";
import { openApiResponse } from "../../openapi-outputs";
import { mapServiceError, protectedProcedure, mutationProcedure } from "../../trpc";

export const reviewFeatureProcedures = {
  runAiReview: mutationProcedure
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
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchAiReview(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  listReviews: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/reviews",
        tags: ["Feature Requests"],
        protect: true,
        summary: "All AI review iterations for a feature request",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return listAiReviewsForFeature(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  addClarification: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/clarifications",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Add a user clarification answer to a feature request",
      },
    })
    .input(z.object({ id: z.string().min(1), content: z.string().min(1) }))
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return appendFeatureActivity(feature.id, {
          kind: "clarification",
          title: "Clarification provided",
          detail: input.content,
          actor: "user",
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getReviewDelta: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/review-delta",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Compare last two AI review iterations — resolved, persisting, and new issues",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return getReviewDelta(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getReviewStats: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/review-stats",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Aggregate AI review statistics: pass rate, avg issues, iteration count",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return getReviewStats(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getReviewLoopHealth: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/review-health",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Comprehensive review loop health: score, SLA status, cycle times, issue resolution",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return getReviewLoopHealth(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  resolveIssue: mutationProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/feature/review-issues/{issueId}/resolve",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Mark an individual AI review issue as resolved (or reopen it)",
      },
    })
    .input(
      z.object({
        issueId: z.string().min(1),
        resolved: z.boolean(),
        notes: z.string().optional(),
      }),
    )
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        return resolveReviewIssue(input.issueId, input.resolved, input.notes, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getIssueResolution: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/reviews/{reviewId}/issue-resolution",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Resolution summary for a specific AI review — blocking issues resolved vs outstanding",
      },
    })
    .input(z.object({ reviewId: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertAiReviewInUserWorkspace(ctx.user.id, input.reviewId);
        return getIssueResolutionSummary(input.reviewId);
      } catch (error) {
        mapServiceError(error);
      }
    }),
};
