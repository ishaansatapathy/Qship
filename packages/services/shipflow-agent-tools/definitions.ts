/**
 * ShipFlow domain tools — shared by the Agent (OpenAI tool loop) and MCP server.
 * Feature delivery pipeline + GitHub workspace tools.
 */

import type { OpenAiToolDefinition } from "../ai/openai-tools";
import type { AgentActionCard } from "../ai/agent";
import { FEATURE_STATUSES, ENGINEERING_TASK_STATUSES } from "../workflow";

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
    description: "Get the authenticated user's Qship workspace (organization + project).",
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
    description: "Break a PRD into engineering tasks via the orchestrated workflow engine.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID (must have PRD)" } },
    },
  },
  {
    name: "implement_feature_code",
    description:
      "Generate real implementation code with AI, commit files to the feature GitHub branch, and open a pull request. Requires PRD, tasks, and a linked repository.",
    inputSchema: {
      type: "object",
      required: ["id", "repositoryId"],
      properties: {
        id: { type: "string", description: "Feature request UUID" },
        repositoryId: { type: "string", description: "Linked GitHub repository ID in workspace" },
      },
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
      "Interactive task walkthrough for Qship Agent: returns pseudo-code steps (brief) or a full implementation guide (full). When analyzeRepo=true and GitHub is connected, compares the task against the linked codebase and reports what is already implemented vs still needed. Use ONE task at a time in walkthrough mode; wait for the user to say 'explain more' or call advance_task_walkthrough for next task.",
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
