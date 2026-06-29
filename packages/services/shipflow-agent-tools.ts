/**
 * ShipFlow domain tools — shared by the Agent (OpenAI tool loop) and MCP server.
 * Feature delivery pipeline + GitHub workspace tools.
 */

import type { OpenAiToolDefinition } from "./ai/openai-tools";
import type { AgentActionCard } from "./ai/agent";
import { ServiceError } from "./errors";
import {
  addClarificationMessage,
  appendFeatureActivity,
  assertFeatureInUserWorkspace,
  assertTaskInUserWorkspace,
  getFeatureDeliveryView,
  getFeatureRequest,
  getPipelineSummary,
  getWorkspaceProjectForUser,
  listFeatureRequests,
  updateEngineeringTaskStatus,
  updateFeatureMetadata,
  updateFeatureStatus,
} from "./feature-request";
import {
  generateApprovalBriefing,
  analyzeChangeRequest,
  generateDeveloperOnboardingGuide,
  triageFeatureRequest,
} from "./feature-ai";
import {
  predictDeliveryTimeline,
  checkPipelineDuplicates,
  getPipelineHealthSummary,
} from "./feature-analytics";
import { checkExistingCapability } from "./feature-education";
import { ingestFeatureRequest, type FeatureSource } from "./feature-intake";
import {
  dispatchAiReview,
  dispatchPrdGeneration,
  dispatchTaskGeneration,
} from "./inngest/dispatch";
import {
  listAiReviewsForFeature,
  getLatestAiReview,
  getReviewDelta,
  getReviewStats,
  getReviewLoopHealth,
  listHumanApprovals,
  markFeatureShipped,
  recordHumanApproval,
  resolveReviewIssue,
  validateHumanApprovalEligibility,
} from "./review";
import { assertReleaseReviewer } from "./workflow-guards";
import {
  getGithubConnectionForUser,
  listGithubRepositoriesForUser,
  syncGithubInstallationForUser,
} from "./github/installation";
import { explainEngineeringTaskForUser, advanceTaskWalkthroughForUser } from "./task-walkthrough";
import { FEATURE_STATUSES, ENGINEERING_TASK_STATUSES } from "./workflow";

export type ShipflowToolContext = {
  userId: string;
  actions: AgentActionCard[];
};

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const SHIPFLOW_MCP_TOOLS: McpToolDef[] = [
  {
    name: "get_workspace",
    description: "Get the authenticated user's ShipFlow workspace (organization + project).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_feature_requests",
    description: "List feature requests in the workspace pipeline, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1–50, default 20)" },
      },
    },
  },
  {
    name: "get_feature_request",
    description: "Get a single feature request with PRD, tasks, and clarifications.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "create_feature_request",
    description:
      "Submit a new employee feature request. Runs duplicate/capability check — may educate if feature already exists — then AI triage.",
    inputSchema: {
      type: "object",
      required: ["title", "rawRequest"],
      properties: {
        title: { type: "string", description: "Short title (min 3 chars)" },
        rawRequest: { type: "string", description: "Full request description (min 10 chars)" },
        runTriage: { type: "boolean", description: "Run AI triage after create (default true)" },
      },
    },
  },
  {
    name: "triage_feature_request",
    description: "Run AI triage on an existing feature request (priority, effort, questions).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "generate_feature_prd",
    description: "Generate an AI PRD for a feature request and mark it prd_ready.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "generate_feature_tasks",
    description: "Break a PRD into engineering tasks and move the feature to planning.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID (must have PRD)" } },
    },
  },
  {
    name: "add_clarification",
    description: "Add a clarification note to a feature request (user or agent message).",
    inputSchema: {
      type: "object",
      required: ["id", "content"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        content: { type: "string", description: "Clarification message" },
        role: { type: "string", enum: ["user", "agent"], description: "Who said this (default agent)" },
      },
    },
  },
  {
    name: "run_ai_review",
    description: "Queue an AI pre-ship review workflow (PRD + tasks + optional PR diff). Uses the same orchestrated pipeline as the UI.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "request_human_review",
    description: "Verify a feature is eligible for human approval (AI review passed, blocking issues resolved). Does not bypass gates.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        note: { type: "string", description: "Optional note for the approver" },
      },
    },
  },
  {
    name: "update_feature_status",
    description: "Deprecated — use generate_feature_prd, generate_feature_tasks, run_ai_review, approve_feature, or ship_feature instead. Direct status jumps are blocked.",
    inputSchema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: [...FEATURE_STATUSES] },
      },
    },
  },
  {
    name: "get_pipeline_summary",
    description: "Counts of features by pipeline stage (submitted, in delivery, awaiting approval, shipped).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "github_connection_status",
    description: "Check whether GitHub App is connected for the workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_github_repositories",
    description: "List GitHub repositories linked to the workspace after GitHub App install.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check_existing_capability",
    description:
      "Check if a requested capability already exists in the workspace before building. Returns education message and matched feature if duplicate.",
    inputSchema: {
      type: "object",
      required: ["title", "rawRequest"],
      properties: {
        title: { type: "string" },
        rawRequest: { type: "string" },
      },
    },
  },
  {
    name: "intake_from_channel",
    description:
      "Intake a feature request from email, support ticket, customer call, or external API channel.",
    inputSchema: {
      type: "object",
      required: ["title", "rawRequest", "source"],
      properties: {
        title: { type: "string" },
        rawRequest: { type: "string" },
        source: {
          type: "string",
          enum: ["email", "support_ticket", "customer_call", "api"],
        },
        externalId: { type: "string", description: "External message/ticket ID for dedupe" },
        channelMeta: { type: "object", description: "Raw channel metadata (from, subject, etc.)" },
        runTriage: { type: "boolean" },
      },
    },
  },
  {
    name: "list_ai_reviews",
    description: "List all AI QA review iterations for a feature, newest first. Shows per-iteration pass/fail, blocking issue titles, and overall progress.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "get_review_delta",
    description: "Compare the latest two AI review iterations — which blocking issues were resolved, which persisted, and whether the review loop is progressing or regressing. Use before running a re-review to orient the developer.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "get_review_stats",
    description: "Get aggregate AI review health statistics: iteration count, total issues, pass rate, and time spent in review. Useful for pipeline health dashboards.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "approve_feature",
    description: "Grant human approval for a feature — moves it to 'approved' status. Only call after the AI review has passed (use list_ai_reviews or get_review_stats to verify). Requires an optional note explaining the approval rationale.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        notes: { type: "string", description: "Approval notes / sign-off rationale (recommended)" },
      },
    },
  },
  {
    name: "reject_feature",
    description: "Reject a feature request — moves it to 'rejected' status. Use when the feature direction is fundamentally wrong or should not be built. A clear rejection reason is required.",
    inputSchema: {
      type: "object",
      required: ["id", "reason"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        reason: { type: "string", description: "Why the feature is being rejected (required — this is logged for the activity trail)" },
      },
    },
  },
  {
    name: "request_changes",
    description: "Request changes on a feature before approval — moves it back to 'fix_needed'. Use when the AI review passed but human review found additional issues. Must include specific change requests.",
    inputSchema: {
      type: "object",
      required: ["id", "notes"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        notes: { type: "string", description: "Specific changes required before this can be approved (required)" },
      },
    },
  },
  {
    name: "ship_feature",
    description:
      "Ship an approved feature to production: merge linked GitHub PR, trigger deploy webhook when configured, notify Slack, and mark status shipped.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID (must be approved)" } },
    },
  },
  {
    name: "get_approval_history",
    description: "Get the full human approval audit trail for a feature — every approve, reject, and changes_requested decision with reviewer notes and timestamps.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "get_approval_briefing",
    description:
      "Generate an AI-powered pre-approval briefing for the human reviewer: risk level, approval recommendation, specific things to verify, and remaining concerns. Call this BEFORE approve_feature to give the reviewer a structured decision-support document.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "resolve_review_issue",
    description:
      "Mark an individual AI review issue as resolved (or reopen it). Use when a developer has fixed a specific blocking issue and you want to track it without re-running the full review. Provide optional resolution notes for the audit trail.",
    inputSchema: {
      type: "object",
      required: ["issueId", "resolved"],
      properties: {
        issueId: { type: "string", description: "AI review issue UUID (from list_ai_reviews)" },
        resolved: { type: "boolean", description: "true = mark resolved, false = reopen" },
        notes: { type: "string", description: "Notes explaining how the issue was resolved" },
      },
    },
  },
  {
    name: "analyze_change_request",
    description:
      "Convert a PM's change-request notes into structured developer action items with categories, priorities, and effort estimates. Run this after reject_feature or request_changes so the developer has an unambiguous TODO list for the next iteration.",
    inputSchema: {
      type: "object",
      required: ["id", "notes"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        notes: {
          type: "string",
          description: "The PM's change request notes — can be vague; the AI will convert to specific engineering tasks",
        },
      },
    },
  },
  {
    name: "get_review_loop_health",
    description:
      "Get a comprehensive health score (0–100) and analysis for a feature's review loop: SLA status, cycle times, issue resolution progress, and overall health label (healthy / needs_attention / critical). Use to surface bottlenecks and risks.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "get_feature_delivery",
    description: "Get delivery timeline, plain-language summary, and recommended next step for a feature.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "update_engineering_task_status",
    description: "Move an engineering task on the Kanban board (backlog → todo → in_progress → review → done).",
    inputSchema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string", description: "Engineering task UUID" },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "review", "done"],
        },
      },
    },
  },
  {
    name: "predict_delivery_timeline",
    description:
      "Predict when a feature will ship based on project velocity history and feature complexity. Returns per-stage time estimates with confidence levels and an overall ship date. Use when stakeholders ask for ETAs.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "check_pipeline_duplicates",
    description:
      "Semantically scan the active pipeline for near-duplicate feature requests. Prevents engineering waste from building the same thing twice. Returns similarity scores, overlapping aspects, and a consolidation recommendation for each match.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID to check for duplicates" } },
    },
  },
  {
    name: "get_pipeline_health",
    description:
      "Get an overview of the entire project pipeline: total active features, distribution by status, top bottleneck stages, features shipped last 30 days, average cycle time, and a health label (healthy / congested / stalled). Use for stand-up summaries and planning.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_developer_onboarding_guide",
    description:
      "Generate a personalised First-30-Minutes onboarding guide for a developer picking up an engineering task. Returns: implementation approach (step-by-step), key architectural areas to understand, likely file patterns to touch, potential pitfalls, testing strategy, and effort estimate. Call this when a developer is about to start work on a task.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "Engineering task UUID" },
      },
    },
  },
  {
    name: "explain_engineering_task",
    description:
      "Interactive task walkthrough for ShipFlow Agent: returns pseudo-code steps (brief) or a full implementation guide (full). When analyzeRepo=true and GitHub is connected, compares the task against the linked codebase and reports what is already implemented vs still needed. Use ONE task at a time in walkthrough mode; wait for the user to say 'explain more' or call advance_task_walkthrough for next task.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string", description: "Engineering task UUID" },
        depth: {
          type: "string",
          enum: ["brief", "full"],
          description: "brief = pseudo-code sketch only; full = detailed explanation",
        },
        analyzeRepo: {
          type: "boolean",
          description: "When true, scan linked GitHub repo for codebase-aware guidance",
        },
      },
    },
  },
  {
    name: "advance_task_walkthrough",
    description:
      "Mark the current engineering task as done and immediately return a brief walkthrough for the NEXT task. Use when the user says 'next task' or 'mark done'. Returns completed=true when all tasks are finished.",
    inputSchema: {
      type: "object",
      required: ["currentTaskId"],
      properties: {
        currentTaskId: { type: "string", description: "Engineering task UUID to mark done" },
        analyzeRepo: {
          type: "boolean",
          description: "When true, scan linked GitHub repo for the next task",
        },
      },
    },
  },
];

export const SHIPFLOW_AGENT_TOOLS: OpenAiToolDefinition[] = SHIPFLOW_MCP_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  },
}));

function featureSummary(row: {
  id: string;
  title: string;
  status: string;
  rawRequest: string;
  metadata?: Record<string, unknown> | null;
}) {
  const triage = row.metadata?.triage as Record<string, unknown> | undefined;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    excerpt: row.rawRequest.slice(0, 200),
    priority: triage?.priority ?? null,
    category: triage?.category ?? null,
  };
}

async function loadAuthorizedFeature(userId: string, id: string) {
  const trimmed = id.trim();
  if (!trimmed) throw new ServiceError("BAD_REQUEST", "id is required");
  return assertFeatureInUserWorkspace(userId, trimmed);
}

export async function executeShipflowTool(
  ctx: ShipflowToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;

  switch (name) {
    case "get_workspace": {
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) {
        return JSON.stringify({ error: "No workspace — join or create one first" });
      }
      return JSON.stringify({
        organizationId: ws.organization.id,
        organizationName: ws.organization.name,
        projectId: ws.project.id,
        projectName: ws.project.name,
        role: ws.role,
      });
    }

    case "list_feature_requests": {
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "No workspace found", requests: [] });
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const rows = await listFeatureRequests(ws.project.id);
      const items = rows.slice(0, limit).map(featureSummary);
      actions.push({
        kind: "feature_list",
        title: "Feature requests",
        detail: `${items.length} request(s)`,
        href: "/requests",
        lines: items.map((r) => `${r.title} · ${r.status}${r.priority ? ` · ${r.priority}` : ""}`),
      });
      return JSON.stringify({ requests: items, count: items.length });
    }

    case "get_feature_request": {
      const id = String(args.id ?? "").trim();
      const { feature: row } = await loadAuthorizedFeature(userId, id);
      actions.push({
        kind: "feature_detail",
        title: row.title,
        detail: row.status,
        href: `/requests?id=${row.id}`,
      });
      return JSON.stringify({
        id: row.id,
        title: row.title,
        status: row.status,
        rawRequest: row.rawRequest,
        metadata: row.metadata,
        hasPrd: Boolean(row.prd),
        taskCount: row.tasks?.length ?? 0,
        clarificationCount: row.clarifications?.length ?? 0,
        prd: row.prd?.content ?? null,
        tasks: row.tasks?.map((t) => ({ id: t.id, title: t.title, status: t.status })) ?? [],
      });
    }

    case "create_feature_request": {
      const title = String(args.title ?? "").trim();
      const rawRequest = String(args.rawRequest ?? "").trim();
      if (title.length < 3 || rawRequest.length < 10) {
        return JSON.stringify({ error: "title (min 3) and rawRequest (min 10) are required" });
      }
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "Join a workspace before submitting requests" });

      const result = await ingestFeatureRequest({
        organizationId: ws.organization.id,
        projectId: ws.project.id,
        title,
        rawRequest,
        createdByUserId: userId,
        source: "api",
        runTriage: args.runTriage !== false,
      });

      const row = result.feature;
      actions.push({
        kind: result.educated ? "feature_education" : "feature_created",
        title: row.title,
        detail: row.status,
        href: `/requests?id=${row.id}`,
      });

      return JSON.stringify({
        ...featureSummary(row),
        educated: result.educated,
        education: result.education,
        triage: result.triage ?? row.metadata?.triage ?? null,
      });
    }

    case "triage_feature_request": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const triage = await triageFeatureRequest({
        title: feature.title,
        rawRequest: feature.rawRequest,
      });
      const row = await updateFeatureMetadata(id, { triage });
      await appendFeatureActivity(id, {
        kind: "triage",
        title: "AI triage re-run",
        detail: triage.priority ? `Priority ${triage.priority}` : undefined,
        actor: "agent",
      });
      return JSON.stringify({ id, triage, status: row.status });
    }

    case "generate_feature_prd": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const dispatch = await dispatchPrdGeneration(id, userId);
      actions.push({
        kind: "feature_detail",
        title: `PRD queued: ${feature.title}`,
        detail: dispatch.mode,
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        status: "prd_generating",
        workflowRunId: dispatch.workflowRunId,
        mode: dispatch.mode,
        message: "PRD generation queued via workflow engine",
      });
    }

    case "generate_feature_tasks": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      if (!feature.prd?.content) {
        return JSON.stringify({ error: "Generate a PRD first (generate_feature_prd)" });
      }
      const dispatch = await dispatchTaskGeneration(id, userId);
      actions.push({
        kind: "feature_tasks",
        title: `Tasks queued: ${feature.title}`,
        detail: dispatch.mode,
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        status: feature.status,
        workflowRunId: dispatch.workflowRunId,
        mode: dispatch.mode,
        message: "Task generation queued via workflow engine",
      });
    }

    case "add_clarification": {
      const id = String(args.id ?? "").trim();
      const content = String(args.content ?? "").trim();
      if (!content) return JSON.stringify({ error: "content is required" });
      await loadAuthorizedFeature(userId, id);
      const role = args.role === "user" ? "user" : "agent";
      const row = await addClarificationMessage({ featureRequestId: id, role, content });
      if (role === "user") {
        await updateFeatureStatus(id, "clarifying").catch(() => undefined);
      }
      return JSON.stringify({ id: row.id, featureRequestId: id, role, content: row.content });
    }

    case "run_ai_review": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const dispatch = await dispatchAiReview(id, userId);
      actions.push({
        kind: "ai_review",
        title: `AI review queued: ${feature.title}`,
        detail: dispatch.mode,
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        workflowRunId: dispatch.workflowRunId,
        mode: dispatch.mode,
        message: "AI review queued via workflow engine",
      });
    }

    case "request_human_review": {
      const id = String(args.id ?? "").trim();
      const note = String(args.note ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);

      try {
        await validateHumanApprovalEligibility(id);
      } catch (error) {
        const message = error instanceof ServiceError ? error.message : "Not eligible for human review";
        return JSON.stringify({ error: message, featureId: id, status: feature.status });
      }

      if (note) {
        await addClarificationMessage({
          featureRequestId: id,
          role: "agent",
          content: `Ready for human approval: ${note}`,
        });
      }

      actions.push({
        kind: "feature_detail",
        title: `Ready for approval: ${feature.title}`,
        detail: "human_review",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        status: "human_review",
        eligible: true,
        message: "Feature passed AI review and is awaiting human approval",
      });
    }

    case "update_feature_status": {
      return JSON.stringify({
        error:
          "Direct status updates are disabled. Use generate_feature_prd, generate_feature_tasks, run_ai_review, approve_feature, or ship_feature.",
      });
    }

    case "get_pipeline_summary": {
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "No workspace found" });
      const summary = await getPipelineSummary(ws.project.id);
      actions.push({
        kind: "pipeline_summary",
        title: "Pipeline summary",
        detail: `${summary.total} total · ${summary.needsAttention} need attention`,
        href: "/requests",
        lines: [
          `Submitted: ${summary.submitted}`,
          `In delivery: ${summary.inDelivery}`,
          `Awaiting approval: ${summary.awaitingApproval}`,
          `Shipped: ${summary.shipped}`,
        ],
      });
      return JSON.stringify(summary);
    }

    case "github_connection_status": {
      await syncGithubInstallationForUser(userId).catch(() => undefined);
      const status = await getGithubConnectionForUser(userId);
      return JSON.stringify(status);
    }

    case "list_github_repositories": {
      await syncGithubInstallationForUser(userId).catch(() => undefined);
      const repos = await listGithubRepositoriesForUser(userId);
      actions.push({
        kind: "github_repos",
        title: "GitHub repositories",
        detail: `${repos.length} repo(s)`,
        href: "/settings",
        lines: repos.slice(0, 8).map((r) => r.fullName),
      });
      return JSON.stringify({
        repositories: repos.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          defaultBranch: r.defaultBranch,
        })),
        count: repos.length,
      });
    }

    case "check_existing_capability": {
      const title = String(args.title ?? "").trim();
      const rawRequest = String(args.rawRequest ?? "").trim();
      if (title.length < 3 || rawRequest.length < 10) {
        return JSON.stringify({ error: "title and rawRequest are required" });
      }
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "No workspace found" });
      const education = await checkExistingCapability({
        projectId: ws.project.id,
        title,
        rawRequest,
      });
      if (education.shouldEducate) {
        actions.push({
          kind: "feature_education",
          title: "Capability already exists",
          detail: education.matchedFeatureTitle ?? "Similar feature found",
          href: education.matchedFeatureId ? `/requests?id=${education.matchedFeatureId}` : "/requests",
        });
      }
      return JSON.stringify(education);
    }

    case "intake_from_channel": {
      const title = String(args.title ?? "").trim();
      const rawRequest = String(args.rawRequest ?? "").trim();
      const source = String(args.source ?? "").trim() as FeatureSource;
      if (title.length < 3 || rawRequest.length < 10) {
        return JSON.stringify({ error: "title and rawRequest are required" });
      }
      if (!["email", "support_ticket", "customer_call", "api"].includes(source)) {
        return JSON.stringify({ error: "source must be email, support_ticket, customer_call, or api" });
      }
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "No workspace found" });

      const result = await ingestFeatureRequest({
        organizationId: ws.organization.id,
        projectId: ws.project.id,
        title,
        rawRequest,
        source,
        createdByUserId: userId,
        externalId: args.externalId ? String(args.externalId) : undefined,
        channelMeta:
          args.channelMeta && typeof args.channelMeta === "object"
            ? (args.channelMeta as Record<string, unknown>)
            : undefined,
        runTriage: args.runTriage !== false,
      });

      actions.push({
        kind: result.educated ? "feature_education" : "feature_created",
        title: result.feature.title,
        detail: `${source} · ${result.feature.status}`,
        href: `/requests?id=${result.feature.id}`,
      });

      return JSON.stringify({
        featureId: result.feature.id,
        status: result.feature.status,
        source,
        educated: result.educated,
        education: result.education,
        triage: result.triage,
      });
    }

    case "list_ai_reviews": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const reviews = await listAiReviewsForFeature(id);
      actions.push({
        kind: "ai_review",
        title: `AI reviews: ${feature.title}`,
        detail: `${reviews.length} iteration(s)`,
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        iterationCount: reviews.length,
        latestPass: reviews[0]?.readyForHuman ?? null,
        reviews: reviews.map((r) => ({
          id: r.id,
          iteration: r.iteration,
          pass: r.readyForHuman,
          summary: r.summary,
          blockingIssues: r.issues?.filter((i) => i.severity === "blocking").map((issue) => ({
            severity: issue.severity,
            title: issue.title,
            category: issue.category,
            filePath: issue.filePath,
          })),
          advisoryCount: r.issues?.filter((i) => i.severity !== "blocking").length ?? 0,
          createdAt: r.createdAt,
        })),
      });
    }

    case "get_review_delta": {
      const id = String(args.id ?? "").trim();
      await loadAuthorizedFeature(userId, id);
      const delta = await getReviewDelta(id);
      if (!delta) {
        return JSON.stringify({ featureId: id, message: "Only one review iteration exists — no delta available yet" });
      }
      return JSON.stringify({ featureId: id, ...delta });
    }

    case "get_review_stats": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const stats = await getReviewStats(id);
      actions.push({
        kind: "ai_review",
        title: `Review health: ${feature.title}`,
        detail: `${stats.iterationCount} iteration(s) · ${stats.passRate}% pass rate`,
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({ featureId: id, ...stats });
    }

    case "approve_feature": {
      const id = String(args.id ?? "").trim();
      const notes = String(args.notes ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);

      await assertReleaseReviewer(userId, id);
      await validateHumanApprovalEligibility(id);

      const result = await recordHumanApproval({
        featureRequestId: id,
        reviewerUserId: userId,
        decision: "approved",
        notes: notes || undefined,
      });
      actions.push({
        kind: "feature_detail",
        title: `Approved: ${feature.title}`,
        detail: "approved",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        decision: result.decision,
        nextStatus: result.nextStatus,
        approvalId: result.id,
        slack: result.slack ?? null,
      });
    }

    case "ship_feature": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const result = await markFeatureShipped(id, userId);
      actions.push({
        kind: "feature_detail",
        title: `Shipped: ${feature.title}`,
        detail: result.release.merge.merged ? "PR merged" : "Released",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({
        featureId: id,
        status: result.status,
        slack: result.slack ?? null,
        release: result.release,
      });
    }

    case "reject_feature": {
      const id = String(args.id ?? "").trim();
      const reason = String(args.reason ?? "").trim();
      if (!reason) return JSON.stringify({ error: "reason is required to reject a feature" });
      const { feature } = await loadAuthorizedFeature(userId, id);
      await assertReleaseReviewer(userId, id);
      const result = await recordHumanApproval({
        featureRequestId: id,
        reviewerUserId: userId,
        decision: "rejected",
        notes: reason,
      });
      actions.push({
        kind: "feature_detail",
        title: `Rejected: ${feature.title}`,
        detail: "rejected",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({ featureId: id, decision: result.decision, nextStatus: result.nextStatus, approvalId: result.id });
    }

    case "request_changes": {
      const id = String(args.id ?? "").trim();
      const notes = String(args.notes ?? "").trim();
      if (!notes) return JSON.stringify({ error: "notes describing the required changes are required" });
      const { feature } = await loadAuthorizedFeature(userId, id);
      await assertReleaseReviewer(userId, id);
      const result = await recordHumanApproval({
        featureRequestId: id,
        reviewerUserId: userId,
        decision: "changes_requested",
        notes,
      });
      actions.push({
        kind: "feature_detail",
        title: `Changes requested: ${feature.title}`,
        detail: "fix_needed",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({ featureId: id, decision: result.decision, nextStatus: result.nextStatus, approvalId: result.id });
    }

    case "get_approval_history": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const approvals = await listHumanApprovals(id);
      return JSON.stringify({
        featureId: id,
        featureTitle: feature.title,
        approvalCount: approvals.length,
        approvals: approvals.map((a) => ({
          id: a.id,
          decision: a.decision,
          notes: a.notes,
          reviewerUserId: a.reviewerUserId,
          createdAt: a.createdAt,
        })),
      });
    }

    case "get_feature_delivery": {
      const id = String(args.id ?? "").trim();
      const delivery = await getFeatureDeliveryView(id, userId);
      actions.push({
        kind: "feature_detail",
        title: delivery.title,
        detail: delivery.statusLabel,
        href: `/requests?id=${id}`,
        lines: [delivery.summary, delivery.nextStep],
      });
      return JSON.stringify(delivery);
    }

    case "update_engineering_task_status": {
      const id = String(args.id ?? "").trim();
      const status = String(args.status ?? "").trim();
      if (!id || !status) return JSON.stringify({ error: "id and status are required" });
      if (!(ENGINEERING_TASK_STATUSES as readonly string[]).includes(status)) {
        return JSON.stringify({
          error: `Invalid status. Allowed: ${ENGINEERING_TASK_STATUSES.join(", ")}`,
        });
      }
      const { task, feature } = await assertTaskInUserWorkspace(userId, id);
      const row = await updateEngineeringTaskStatus(
        id,
        status as (typeof ENGINEERING_TASK_STATUSES)[number],
      );
      await appendFeatureActivity(task.featureRequestId, {
        kind: "tasks",
        title: `Task → ${status.replace(/_/g, " ")}`,
        detail: task.title,
        actor: "agent",
      });
      actions.push({
        kind: "feature_tasks",
        title: `Task updated: ${task.title}`,
        detail: status,
        href: `/tasks`,
        lines: [`Feature: ${feature.title}`],
      });
      return JSON.stringify({
        id: row.id,
        title: row.title,
        status: row.status,
        featureId: task.featureRequestId,
        featureTitle: feature.title,
      });
    }

    case "get_approval_briefing": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      const [latestReview, delta, priorDecisions] = await Promise.all([
        getLatestAiReview(id),
        getReviewDelta(id),
        listHumanApprovals(id),
      ]);
      if (!latestReview) {
        return JSON.stringify({ error: "No AI review found. Run run_ai_review first." });
      }
      const issues = latestReview.issues as Array<{
        title: string; category: string; description: string; severity: string;
      }>;
      const briefing = await generateApprovalBriefing({
        featureTitle: feature.title,
        rawRequest: feature.rawRequest,
        prd: (feature.prd as { content: import("@repo/database/schema").PrdContent } | null)?.content ?? null,
        latestReview: {
          iteration: latestReview.iteration,
          summary: latestReview.summary,
          pass: latestReview.readyForHuman,
          blockingIssues: issues.filter((i) => i.severity === "blocking"),
          advisoryIssues: issues.filter((i) => i.severity !== "blocking"),
        },
        delta,
        priorDecisions: priorDecisions.map((d) => ({
          decision: d.decision,
          notes: d.notes,
          createdAt: d.createdAt,
        })),
      });
      actions.push({
        kind: "feature_detail",
        title: `Approval briefing: ${feature.title}`,
        detail: `${briefing.approvalRecommendation} (confidence: ${briefing.confidence}%)`,
        href: `/requests?id=${id}`,
        lines: [briefing.summary, briefing.rationale],
      });
      return JSON.stringify({ featureId: id, featureTitle: feature.title, ...briefing });
    }

    case "resolve_review_issue": {
      const issueId = String(args.issueId ?? "").trim();
      const resolved = Boolean(args.resolved);
      const notes = args.notes ? String(args.notes).trim() : undefined;
      if (!issueId) return JSON.stringify({ error: "issueId is required" });
      const result = await resolveReviewIssue(issueId, resolved, notes, userId);
      actions.push({
        kind: "feature_detail",
        title: resolved ? `Issue resolved: ${result.title}` : `Issue reopened: ${result.title}`,
        detail: notes ?? (resolved ? "marked resolved" : "reopened"),
      });
      return JSON.stringify(result);
    }

    case "analyze_change_request": {
      const id = String(args.id ?? "").trim();
      const notes = String(args.notes ?? "").trim();
      if (!notes) return JSON.stringify({ error: "notes are required" });
      const { feature } = await loadAuthorizedFeature(userId, id);
      const latestReview = await getLatestAiReview(id);
      const analysis = await analyzeChangeRequest({
        featureTitle: feature.title,
        changeRequestNotes: notes,
        latestReview: latestReview
          ? {
              summary: latestReview.summary,
              blockingIssues: (latestReview.issues as Array<{ title: string; category: string; severity: string }>)
                .filter((i) => i.severity === "blocking")
                .map((i) => ({ title: i.title, category: i.category })),
            }
          : null,
      });
      actions.push({
        kind: "feature_detail",
        title: `Change analysis: ${feature.title}`,
        detail: `${analysis.actionItems.length} action items (${analysis.totalBlockingEffort} effort)`,
        href: `/requests?id=${id}`,
        lines: [analysis.summary, `Next: ${analysis.nextStep}`],
      });
      return JSON.stringify({ featureId: id, featureTitle: feature.title, ...analysis });
    }

    case "get_review_loop_health": {
      const id = String(args.id ?? "").trim();
      const health = await getReviewLoopHealth(id);
      return JSON.stringify(health);
    }

    case "predict_delivery_timeline": {
      const id = String(args.id ?? "").trim();
      const { ws } = await loadAuthorizedFeature(userId, id);
      const prediction = await predictDeliveryTimeline(id, ws.project.id);
      actions.push({
        kind: "feature_detail",
        title: `Delivery prediction: ${prediction.featureTitle}`,
        detail: `Ships in ~${prediction.totalRemainingDays} days (confidence: ${prediction.overallConfidence}%)`,
        href: `/requests?id=${id}`,
        lines: [prediction.basisDescription],
      });
      return JSON.stringify(prediction);
    }

    case "check_pipeline_duplicates": {
      const id = String(args.id ?? "").trim();
      const { feature, ws } = await loadAuthorizedFeature(userId, id);
      const result = await checkPipelineDuplicates(id, ws.project.id);
      actions.push({
        kind: "feature_detail",
        title: `Duplicate check: ${feature.title}`,
        detail: result.hasSimilar
          ? `${result.topCandidates.length} similar feature(s) found`
          : "No duplicates detected",
        href: `/requests?id=${id}`,
        lines: result.hasSimilar ? [result.consolidationRecommendation] : [],
      });
      return JSON.stringify(result);
    }

    case "get_pipeline_health": {
      const ws = await getWorkspaceProjectForUser(userId);
      if (!ws) return JSON.stringify({ error: "Join a workspace first" });
      const health = await getPipelineHealthSummary(ws.project.id);
      actions.push({
        kind: "pipeline_summary",
        title: `Pipeline: ${health.healthLabel}`,
        detail: health.insight,
      });
      return JSON.stringify(health);
    }

    case "get_developer_onboarding_guide": {
      const taskId = String(args.taskId ?? "").trim();
      if (!taskId) return JSON.stringify({ error: "taskId is required" });
      const { task, feature } = await assertTaskInUserWorkspace(userId, taskId);
      const featureDetail = await getFeatureRequest(feature.id);
      const guide = await generateDeveloperOnboardingGuide({
        taskTitle: task.title,
        taskDescription: task.description,
        taskType: task.taskType ?? undefined,
        acceptanceCriteria: task.acceptanceCriteria ?? undefined,
        featureTitle: feature.title,
        prd: featureDetail.prd?.content ?? null,
      });
      actions.push({
        kind: "feature_tasks",
        title: `Onboarding guide: ${task.title}`,
        detail: `${guide.estimatedComplexity} complexity · ~${guide.estimatedHours}h`,
        href: `/tasks`,
        lines: [guide.summary, `Start: ${guide.firstAction}`],
      });
      return JSON.stringify(guide);
    }

    case "explain_engineering_task": {
      const taskId = String(args.taskId ?? "").trim();
      if (!taskId) return JSON.stringify({ error: "taskId is required" });
      const depth = args.depth === "full" ? "full" : "brief";
      const analyzeRepo = args.analyzeRepo === true;

      const result = await explainEngineeringTaskForUser(userId, {
        taskId,
        depth,
        analyzeRepo,
      });
      const { walkthrough, taskIndex } = result;

      const modeLabel = walkthrough.mode === "repo_aware" ? "codebase-aware" : "plan-only";
      const implemented = walkthrough.repoFindings?.alreadyImplemented ?? [];
      actions.push({
        kind: "feature_tasks",
        title: `Task ${taskIndex}/${walkthrough.totalTasks}: ${walkthrough.taskTitle}`,
        detail: `${modeLabel} · ${depth === "brief" ? "pseudo-code" : "full guide"}`,
        href: `/tasks`,
        lines: [
          walkthrough.briefSummary,
          ...walkthrough.pseudoCodeSteps.slice(0, 3),
          ...implemented.slice(0, 2).map((x) => `✓ ${x.file}: ${x.note}`),
        ],
      });
      return JSON.stringify({
        ...walkthrough,
        taskId: result.taskId,
        featureId: result.featureId,
        repository: result.repository,
        repoSnippetCount: result.repoSnippetCount,
      });
    }

    case "advance_task_walkthrough": {
      const currentTaskId = String(args.currentTaskId ?? "").trim();
      if (!currentTaskId) return JSON.stringify({ error: "currentTaskId is required" });
      const analyzeRepo = args.analyzeRepo === true;

      const result = await advanceTaskWalkthroughForUser(userId, { currentTaskId, analyzeRepo });
      if (result.completed) {
        actions.push({
          kind: "feature_tasks",
          title: "Walkthrough complete",
          detail: result.message,
          href: "/tasks",
        });
        return JSON.stringify(result);
      }

      const { walkthrough, taskIndex } = result;
      const modeLabel = walkthrough.mode === "repo_aware" ? "codebase-aware" : "plan-only";
      actions.push({
        kind: "feature_tasks",
        title: `Task ${taskIndex}/${walkthrough.totalTasks}: ${walkthrough.taskTitle}`,
        detail: `${modeLabel} · next task`,
        href: `/tasks`,
        lines: [walkthrough.briefSummary, ...walkthrough.pseudoCodeSteps.slice(0, 3)],
      });
      return JSON.stringify(result);
    }

    default:
      throw new ServiceError("NOT_FOUND", `Unknown ShipFlow tool: ${name}`);
  }
}

export function isShipflowTool(name: string): boolean {
  return SHIPFLOW_MCP_TOOLS.some((t) => t.name === name);
}

/** Prefix for feature-request focus stored in session focusContextId. */
export const FEATURE_FOCUS_PREFIX = "feature:";

export function isFeatureFocusId(value: string | undefined): boolean {
  return Boolean(value?.startsWith(FEATURE_FOCUS_PREFIX));
}

export function toFeatureFocusId(featureId: string): string {
  return `${FEATURE_FOCUS_PREFIX}${featureId}`;
}

export function fromFeatureFocusId(value: string): string {
  return value.startsWith(FEATURE_FOCUS_PREFIX) ? value.slice(FEATURE_FOCUS_PREFIX.length) : value;
}
