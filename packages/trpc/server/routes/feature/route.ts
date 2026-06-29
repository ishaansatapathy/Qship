import { z, zodUndefinedModel } from "../../schema";
import {
  getFeatureRequest,
  getFeatureDeliveryView,
  getPipelineSummary,
  getWorkspaceProjectForUser,
  listFeatureRequests,
  listTaskBoard,
  assertFeatureInUserWorkspace,
  assertTaskInUserWorkspace,
  updateEngineeringTaskStatus,
  appendFeatureActivity,
} from "@repo/services/feature-request";
import { ingestFeatureRequest, getIntakeSummary } from "@repo/services/feature-intake";
import { dispatchAiReview, dispatchCodeImplementation, dispatchPrdGeneration, dispatchTaskGeneration, recoverStaleWorkflowRuns } from "@repo/services/inngest/dispatch";
import { cancelActiveWorkflowRuns, listWorkflowRunsForFeature } from "@repo/services/workflow-runs";
import { createFeaturePullRequest } from "@repo/services/github/pr";
import { getGithubConnectionForUser } from "@repo/services/github/installation";
import { assertReleaseReviewer } from "@repo/services/workflow-guards";
import {
  listAiReviewsForFeature,
  markFeatureShipped,
  recordHumanApproval,
  validateHumanApprovalEligibility,
  listHumanApprovals,
  getHumanApprovalEligibility,
  getReviewDelta,
  getReviewStats,
  getLatestAiReview,
  resolveReviewIssue,
  getIssueResolutionSummary,
  getReviewLoopHealth,
  assertAiReviewInUserWorkspace,
} from "@repo/services/review";
import { guardedUpdateFeatureStatus } from "@repo/services/feature-request";
import { generateApprovalBriefing, analyzeChangeRequest, generateDeveloperOnboardingGuide } from "@repo/services/feature-ai";
import { explainEngineeringTaskForUser, getTaskWalkthroughState } from "@repo/services/task-walkthrough";
import {
  predictDeliveryTimeline,
  checkPipelineDuplicates,
  getPipelineHealthSummary,
} from "@repo/services/feature-analytics";
import { ServiceError } from "@repo/services/errors";
import { FEATURE_STATUSES, ENGINEERING_TASK_STATUSES, type EngineeringTaskStatus } from "@repo/services/workflow";
import {
  openApiResponse,
  workspaceOutput,
  pipelineSummaryOutput,
  intakeSummaryOutput,
  cancelWorkflowOutput,
} from "../../openapi-outputs";
import { mapServiceError, protectedProcedure, mutationProcedure, publicProcedure, router } from "../../trpc";

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
    .output(workspaceOutput).query(async ({ ctx }) => {
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
    .output(pipelineSummaryOutput).query(async ({ ctx }) => {
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

  intakeSummary: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/intake-summary",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Counts of feature requests by intake channel",
      },
    })
    .input(zodUndefinedModel)
    .output(intakeSummaryOutput).query(async ({ ctx }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        if (!ws) {
          return {
            total: 0,
            manual: 0,
            email: 0,
            support_ticket: 0,
            customer_call: 0,
            api: 0,
          };
        }
        return getIntakeSummary(ws.project.id);
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
    try {
      return await getFeatureDeliveryView(input.id, ctx.user.id);
    } catch (error) {
      mapServiceError(error);
    }
  }),

  create: mutationProcedure
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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

        const result = await ingestFeatureRequest({
          organizationId: ws.organization.id,
          projectId: ws.project.id,
          title: input.title,
          rawRequest: input.rawRequest,
          createdByUserId: ctx.user.id,
          source: input.source,
          runTriage: input.runTriage,
        });

        return result.feature;
      } catch (error) {
        mapServiceError(error);
      }
    }),

  intakeFromChannel: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/intake",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Intake a feature from email, support ticket, or customer call",
      },
    })
    .input(
      z.object({
        source: z.enum(["email", "support_ticket", "customer_call"]),
        title: z.string().min(3),
        rawRequest: z.string().min(10),
        externalId: z.string().optional(),
        channelMeta: z.record(z.string(), z.unknown()).optional(),
        runTriage: z.boolean().optional(),
      }),
    )
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        if (!ws) {
          throw new ServiceError("FORBIDDEN", "Join a workspace before submitting requests");
        }

        const result = await ingestFeatureRequest({
          organizationId: ws.organization.id,
          projectId: ws.project.id,
          title: input.title,
          rawRequest: input.rawRequest,
          createdByUserId: ctx.user.id,
          source: input.source,
          externalId: input.externalId,
          channelMeta: input.channelMeta,
          runTriage: input.runTriage,
        });

        return {
          feature: result.feature,
          educated: result.educated,
          education: result.education,
          triage: result.triage,
        };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  generatePrd: mutationProcedure
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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
        await recoverStaleWorkflowRuns(input.featureId, ctx.user.id);
        return listWorkflowRunsForFeature(input.featureId);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  cancelWorkflow: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{featureId}/workflow/cancel",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Cancel active Inngest/background workflow runs for a feature",
      },
    })
    .input(
      z.object({
        featureId: z.string().min(1),
        workflowRunId: z.string().optional(),
      }),
    )
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.featureId);
        if (input.workflowRunId) {
          const { cancelWorkflowRunWithCleanup } = await import("@repo/services/workflow-runs");
          await cancelWorkflowRunWithCleanup(input.workflowRunId);
          return { cancelled: 1 };
        }
        return cancelActiveWorkflowRuns(input.featureId);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateStatus: mutationProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/feature/requests/{id}/status",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Move a feature request to an adjacent pipeline status (FSM-validated)",
      },
    })
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(FEATURE_STATUSES as unknown as [string, ...string[]]),
      }),
    )
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return guardedUpdateFeatureStatus(
          input.id,
          feature.status as (typeof FEATURE_STATUSES)[number],
          input.status as (typeof FEATURE_STATUSES)[number],
        );
      } catch (error) {
        mapServiceError(error);
      }
    }),

  generateTasks: mutationProcedure
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchTaskGeneration(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  implementCode: mutationProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/requests/{id}/implement",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Generate implementation code with AI, commit to GitHub branch, and open PR",
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
        return dispatchCodeImplementation({
          featureId: input.id,
          userId: ctx.user.id,
          organizationId: ws.organization.id,
          installationId: gh.installationId,
          repositoryId: input.repositoryId,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  explainTask: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/feature/tasks/{taskId}/explain",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Interactive engineering task walkthrough (brief pseudo-code or full guide)",
      },
    })
    .input(
      z.object({
        taskId: z.string().uuid(),
        depth: z.enum(["brief", "full"]).default("brief"),
        analyzeRepo: z.boolean().default(false),
      }),
    )
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        await assertTaskInUserWorkspace(ctx.user.id, input.taskId);
        return explainEngineeringTaskForUser(ctx.user.id, input);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  getTaskWalkthroughState: protectedProcedure
    .input(
      z.object({
        featureId: z.string().uuid(),
        currentTaskId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return getTaskWalkthroughState(ctx.user.id, input);
      } catch (error) {
        mapServiceError(error);
      }
    }),

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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return dispatchAiReview(input.id, ctx.user.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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

  taskBoard: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/task-board",
        tags: ["Feature Requests"],
        protect: true,
        summary: "All engineering tasks in the workspace for Kanban board",
      },
    })
    .input(zodUndefinedModel)
    .output(
      z.object({
        tasks: z.array(
          z.object({
            id: z.string(),
            featureId: z.string(),
            featureTitle: z.string(),
            featureStatus: z.string(),
            title: z.string(),
            description: z.string(),
            status: z.enum(ENGINEERING_TASK_STATUSES as unknown as [string, ...string[]]),
            sortOrder: z.number(),
            updatedAt: z.coerce.date(),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        if (!ws) return { tasks: [] };
        const tasks = await listTaskBoard(ws.project.id);
        return { tasks };
      } catch (error) {
        mapServiceError(error);
      }
    }),

  updateTaskStatus: mutationProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/feature/tasks/{id}/status",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Move an engineering task to a new Kanban column",
      },
    })
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(ENGINEERING_TASK_STATUSES as unknown as [string, ...string[]]),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        featureRequestId: z.string(),
        title: z.string(),
        description: z.string(),
        status: z.enum(ENGINEERING_TASK_STATUSES as unknown as [string, ...string[]]),
        sortOrder: z.number(),
        updatedAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { task } = await assertTaskInUserWorkspace(ctx.user.id, input.id);
        const row = await updateEngineeringTaskStatus(
          input.id,
          input.status as EngineeringTaskStatus,
        );
        await appendFeatureActivity(task.featureRequestId, {
          kind: "tasks",
          title: `Task → ${input.status.replace(/_/g, " ")}`,
          detail: task.title,
          actor: "user",
        });
        return row;
      } catch (error) {
        mapServiceError(error);
      }
    }),

  // ── Review loop health & analytics ────────────────────────────────────────

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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return getReviewLoopHealth(input.id);
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        const [latestReview, delta, priorDecisions] = await Promise.all([
          getLatestAiReview(input.id),
          getReviewDelta(input.id),
          listHumanApprovals(input.id),
        ]);

        if (!latestReview) {
          throw new ServiceError("PRECONDITION_FAILED", "Run an AI review before requesting an approval briefing");
        }

        const blockingIssues = (latestReview.issues as Array<{
          title: string; category: string; description: string; severity: string;
        }>).filter((i) => i.severity === "blocking");
        const advisoryIssues = (latestReview.issues as Array<{
          title: string; category: string; severity: string;
        }>).filter((i) => i.severity !== "blocking");

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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
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
        summary: "Resolution summary for a specific AI review — how many blocking issues resolved vs outstanding",
      },
    })
    .input(z.object({ reviewId: z.string().min(1) }))
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        await assertAiReviewInUserWorkspace(ctx.user.id, input.reviewId);
        return getIssueResolutionSummary(input.reviewId);
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
    .output(openApiResponse).query(async ({ ctx, input }) => {
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
    .output(openApiResponse).mutation(async ({ ctx, input }) => {
      try {
        const { feature } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        const latestReview = await getLatestAiReview(input.id);
        return analyzeChangeRequest({
          featureTitle: feature.title,
          changeRequestNotes: input.notes,
          latestReview: latestReview
            ? {
                summary: latestReview.summary,
                blockingIssues: (latestReview.issues as Array<{ title: string; category: string; severity: string }>)
                  .filter((i) => i.severity === "blocking")
                  .map((i) => ({ title: i.title, category: i.category })),
              }
            : null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),

  // ── Analytics & intelligence ───────────────────────────────────────────────

  predictDelivery: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/delivery-prediction",
        tags: ["Feature Requests"],
        protect: true,
        summary: "AI-powered delivery timeline prediction based on project velocity history",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        const { ws } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return predictDeliveryTimeline(input.id, ws.project.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  checkDuplicates: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/requests/{id}/duplicate-check",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Semantically detect near-duplicate feature requests in the active pipeline",
      },
    })
    .input(z.object({ id: z.string().min(1) }))
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        const { ws } = await assertFeatureInUserWorkspace(ctx.user.id, input.id);
        return checkPipelineDuplicates(input.id, ws.project.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  pipelineHealth: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/pipeline/health",
        tags: ["Feature Requests"],
        protect: true,
        summary: "Pipeline health summary: bottlenecks, velocity, shipped last 30 days",
      },
    })
    .input(zodUndefinedModel)
    .output(openApiResponse).query(async ({ ctx }) => {
      try {
        const ws = await getWorkspaceProjectForUser(ctx.user.id);
        if (!ws) throw new ServiceError("PRECONDITION_FAILED", "Join a workspace first");
        return getPipelineHealthSummary(ws.project.id);
      } catch (error) {
        mapServiceError(error);
      }
    }),

  developerOnboarding: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/feature/tasks/{taskId}/onboarding-guide",
        tags: ["Feature Requests"],
        protect: true,
        summary: "AI-generated First-30-Minutes onboarding guide for a developer picking up a task",
      },
    })
    .input(z.object({ taskId: z.string().min(1) }))
    .output(openApiResponse).query(async ({ ctx, input }) => {
      try {
        const { task, feature } = await assertTaskInUserWorkspace(ctx.user.id, input.taskId);
        const featureDetail = await getFeatureRequest(feature.id);
        return generateDeveloperOnboardingGuide({
          taskTitle: task.title,
          taskDescription: task.description,
          taskType: (task as Record<string, unknown>).type as string | undefined,
          acceptanceCriteria: (task as Record<string, unknown>).acceptanceCriteria as string[] | undefined,
          featureTitle: feature.title,
          prd: featureDetail.prd?.content ?? null,
        });
      } catch (error) {
        mapServiceError(error);
      }
    }),
});
