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
  createFeatureRequest,
  getFeatureRequest,
  getPipelineSummary,
  getWorkspaceProjectForUser,
  listFeatureRequests,
  replaceFeatureTasks,
  saveFeaturePrd,
  updateFeatureMetadata,
  updateFeatureStatus,
} from "./feature-request";
import {
  generateFeaturePrd,
  generateFeatureTasks,
  runFeatureAiReview,
  triageFeatureRequest,
} from "./feature-ai";
import {
  getGithubConnectionForUser,
  listGithubRepositoriesForUser,
  syncGithubInstallationForUser,
} from "./github/installation";
import { FEATURE_STATUSES } from "./workflow";

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
    description: "Submit a new employee feature request to the delivery pipeline.",
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
    description: "Run an AI pre-ship review on a feature (PRD + tasks) and update pipeline status.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Feature request UUID" } },
    },
  },
  {
    name: "request_human_review",
    description: "Move a feature to human_review — awaiting human sign-off before ship.",
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
    description: "Move a feature request to a new pipeline status.",
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

      let row = await createFeatureRequest({
        organizationId: ws.organization.id,
        projectId: ws.project.id,
        title,
        rawRequest,
        createdByUserId: userId,
        source: "api",
      });

      const runTriage = args.runTriage !== false;
      if (runTriage) {
        const triage = await triageFeatureRequest({ title: row.title, rawRequest: row.rawRequest });
        row = await updateFeatureMetadata(row.id, { triage });
        await appendFeatureActivity(row.id, {
          kind: "triage",
          title: "AI triage completed",
          detail: triage.priority ? `Priority ${triage.priority}` : undefined,
          actor: "agent",
        });
      }

      await appendFeatureActivity(row.id, {
        kind: "submitted",
        title: "Feature submitted via agent",
        detail: row.title,
        actor: "agent",
      });

      actions.push({
        kind: "feature_created",
        title: row.title,
        detail: row.status,
        href: "/requests",
      });
      return JSON.stringify({ ...featureSummary(row), triage: row.metadata?.triage ?? null });
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
      await updateFeatureStatus(id, "prd_generating");
      const content = await generateFeaturePrd({
        title: feature.title,
        rawRequest: feature.rawRequest,
      });
      const prd = await saveFeaturePrd(id, content);
      await updateFeatureStatus(id, "prd_ready");
      await appendFeatureActivity(id, {
        kind: "prd",
        title: "PRD generated",
        detail: `${content.goals?.length ?? 0} goals · ${content.userStories?.length ?? 0} user stories`,
        actor: "agent",
      });
      actions.push({
        kind: "feature_detail",
        title: `PRD: ${feature.title}`,
        detail: "prd_ready",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify({ featureId: id, status: "prd_ready", prd: { version: prd.version, content } });
    }

    case "generate_feature_tasks": {
      const id = String(args.id ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      if (!feature.prd?.content) {
        return JSON.stringify({ error: "Generate a PRD first (generate_feature_prd)" });
      }
      const drafts = await generateFeatureTasks({
        title: feature.title,
        rawRequest: feature.rawRequest,
        prd: feature.prd.content,
      });
      const tasks = await replaceFeatureTasks(id, drafts);
      await updateFeatureStatus(id, "planning");
      await appendFeatureActivity(id, {
        kind: "tasks",
        title: "Engineering tasks generated",
        detail: `${tasks.length} task(s)`,
        actor: "agent",
      });
      actions.push({
        kind: "feature_tasks",
        title: `Tasks: ${feature.title}`,
        detail: `${tasks.length} engineering task(s)`,
        href: `/requests?id=${id}`,
        lines: tasks.map((t) => `${t.title} · ${t.status}`),
      });
      return JSON.stringify({
        featureId: id,
        status: "planning",
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
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
      const review = await runFeatureAiReview({
        title: feature.title,
        rawRequest: feature.rawRequest,
        prd: feature.prd?.content ?? null,
        taskTitles: feature.tasks?.map((t) => t.title) ?? [],
      });
      const nextStatus = review.pass ? "human_review" : "fix_needed";
      await updateFeatureStatus(id, nextStatus);
      await updateFeatureMetadata(id, {
        lastAiReview: {
          at: new Date().toISOString(),
          pass: review.pass,
          summary: review.summary,
          findings: review.findings,
        },
      });
      await appendFeatureActivity(id, {
        kind: "ai_review",
        title: review.pass ? "AI review passed" : "AI review — fixes needed",
        detail: review.summary,
        actor: "agent",
      });
      actions.push({
        kind: "ai_review",
        title: `AI review: ${feature.title}`,
        detail: review.pass ? "Passed — ready for human review" : "Fixes needed",
        href: `/requests?id=${id}`,
        lines: review.findings.slice(0, 5),
      });
      return JSON.stringify({ featureId: id, status: nextStatus, review });
    }

    case "request_human_review": {
      const id = String(args.id ?? "").trim();
      const note = String(args.note ?? "").trim();
      const { feature } = await loadAuthorizedFeature(userId, id);
      if (note) {
        await addClarificationMessage({
          featureRequestId: id,
          role: "agent",
          content: `Ready for human approval: ${note}`,
        });
      }
      const row = await updateFeatureStatus(id, "human_review");
      await appendFeatureActivity(id, {
        kind: "human_review",
        title: "Sent for human approval",
        detail: note || undefined,
        actor: "agent",
      });
      actions.push({
        kind: "feature_detail",
        title: `Awaiting approval: ${feature.title}`,
        detail: "human_review",
        href: `/requests?id=${id}`,
      });
      return JSON.stringify(featureSummary(row));
    }

    case "update_feature_status": {
      const id = String(args.id ?? "").trim();
      const status = String(args.status ?? "").trim();
      if (!id || !status) return JSON.stringify({ error: "id and status are required" });
      if (!(FEATURE_STATUSES as readonly string[]).includes(status)) {
        return JSON.stringify({ error: `Invalid status. Allowed: ${FEATURE_STATUSES.join(", ")}` });
      }
      await loadAuthorizedFeature(userId, id);
      const row = await updateFeatureStatus(id, status as (typeof FEATURE_STATUSES)[number]);
      await appendFeatureActivity(id, {
        kind: "status",
        title: `Status → ${status}`,
        actor: "agent",
      });
      return JSON.stringify(featureSummary(row));
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
