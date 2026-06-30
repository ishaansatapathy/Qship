/**
 * Human Approval sub-router — approve, requestChanges, reject, getApprovalEligibility,
 * getApprovalBriefing, getApprovalHistory, analyzeChangeRequest.
 *
 * All mutating procedures use mutationProcedure (requires emailVerified).
 * The requestChanges/reject alias share runRequestChangesMutation to keep logic DRY.
 */
import { z } from "../../schema";
import {
  assertFeatureInUserWorkspace,
} from "@repo/services/feature-request";
import { assertReleaseReviewer } from "@repo/services/workflow-guards";
import {
  listHumanApprovals,
  getHumanApprovalEligibility,
  validateHumanApprovalEligibility,
  recordHumanApproval,
  getLatestAiReview,
  getReviewDelta,
} from "@repo/services/review";
import { generateApprovalBriefing, analyzeChangeRequest } from "@repo/services/feature-ai";
import { ServiceError } from "@repo/services/errors";
import { openApiResponse } from "../../openapi-outputs";
import { mapServiceError, protectedProcedure, mutationProcedure } from "../../trpc";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const requestChangesInput = z.object({
  id: z.string().min(1),
  notes: z.string().min(1, "Change request must include notes describing required fixes"),
  analyzeWithAi: z.boolean().default(true),
});

async function runRequestChangesMutation(
  ctx: { user: { id: string } },
  input: z.infer<typeof requestChangesInput>,
) {
  const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
  await assertReleaseReviewer(ctx.user.id, input.id);
  const result = await recordHumanApproval({
    featureRequestId: input.id,
    reviewerUserId: ctx.user.id,
    decision: "changes_requested",
    notes: input.notes,
  });
  if (input.analyzeWithAi) {
    const latestReview = await getLatestAiReview(input.id);
    analyzeChangeRequest({
      featureTitle: feature.title,
      changeRequestNotes: input.notes,
      latestReview: latestReview
        ? {
            summary: latestReview.summary,
            blockingIssues: (
              latestReview.issues as Array<{ title: string; category: string; severity: string }>
            )
              .filter((i) => i.severity === "blocking")
              .map((i) => ({ title: i.title, category: i.category })),
          }
        : null,
    }).catch(() => {
      // Non-fatal — change request already recorded
    });
  }
  return result;
}

// ── Procedures ─────────────────────────────────────────────────────────────────

export const approvalFeatureProcedures = {
  getApprovalEligibility: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/approval-eligibility",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Whether a feature can be approved (same gate as approve mutation)",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return getHumanApprovalEligibility(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  approve: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/approve",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Approve a feature request (blocked if AI has unresolved blocking issues)",
      },
    })
    .input(z.object({ id: z.string().min(1), notes: z.string().optional() }))
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        await assertReleaseReviewer(ctx.user.id, input.id);
        await validateHumanApprovalEligibility(input.id);
        return recordHumanApproval({
          featureRequestId: input.id,
          reviewerUserId: ctx.user.id,
          decision: "approved",
          notes: input.notes,
          skipEligibilityCheck: true,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /** Primary route: record that reviewer requests changes, optionally kick off AI analysis. */
  requestChanges: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/request-changes",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Request changes on a feature (returns feature to fix loop)",
      },
    })
    .input(requestChangesInput)
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        return await runRequestChangesMutation(ctx, input);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  /** Deprecated alias — identical behaviour, kept for backwards-compat. */
  reject: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/reject",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Deprecated alias — use requestChanges (returns feature to fix loop)",
      },
    })
    .input(requestChangesInput)
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        return await runRequestChangesMutation(ctx, input);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getApprovalBriefing: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/approval-briefing",
        tags: ["Feature Requests"],
        protect: true,
        summary: "AI-generated decision-support briefing for the human reviewer",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        const [latestReview, delta, priorDecisions] = await Promise.all([
          getLatestAiReview(input.id),
          getReviewDelta(input.id),
          listHumanApprovals(input.id),
        ]);

        if (!latestReview) {
          throw new ServiceError(
            "PRECONDITION_FAILED",
            "Run an AI review before requesting an approval briefing",
          );
        }

        const blockingIssues = (
          latestReview.issues as Array<{
            title: string;
            category: string;
            description: string;
            severity: string;
          }>
        ).filter((i) => i.severity === "blocking");

        const advisoryIssues = (
          latestReview.issues as Array<{
            title: string;
            category: string;
            severity: string;
          }>
        ).filter((i) => i.severity !== "blocking");

        return generateApprovalBriefing({
          featureTitle: feature.title,
          rawRequest: feature.rawRequest,
          prd: feature.prd?.content ?? null,
          latestReview: {
            iteration: latestReview.iteration,
            summary: latestReview.summary,
            pass: latestReview.readyForHuman,
            blockingIssues,
            advisoryIssues,
          },
          delta,
          priorDecisions: priorDecisions?.map((d) => ({
            decision: d.decision,
            notes: d.notes,
            createdAt: d.createdAt,
          })),
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getApprovalHistory: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/approval-history",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Full audit trail of human approval decisions for a feature",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse)
    .query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return listHumanApprovals(input.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  analyzeChangeRequest: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/analyze-change-request",
        tags: ["Feature Requests"],
        protect: true,
        summary: "AI analysis of PM change-request notes into structured developer action items",
      },
    })
    .input(z.object({ id: z.string().min(1), notes: z.string().min(1) }))
    .output(openApiResponse)
    .mutation(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        const latestReview = await getLatestAiReview(input.id);
        return analyzeChangeRequest({
          featureTitle: feature.title,
          changeRequestNotes: input.notes,
          latestReview: latestReview
            ? {
                summary: latestReview.summary,
                blockingIssues: (
                  latestReview.issues as Array<{
                    title: string;
                    category: string;
                    severity: string;
                  }>
                )
                  .filter((i) => i.severity === "blocking")
                  .map((i) => ({ title: i.title, category: i.category })),
              }
            : null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
};
