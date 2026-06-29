import type { OpenAiToolDefinition } from "../../ai/openai-tools";
import type { AgentActionCard } from "../../ai/agent";
import { ServiceError } from "../../errors";
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
  transitionFeatureStatus,
} from "../../feature-request";
import {
  generateApprovalBriefing,
  analyzeChangeRequest,
  generateDeveloperOnboardingGuide,
  triageFeatureRequest,
} from "../../feature-ai";
import {
  predictDeliveryTimeline,
  checkPipelineDuplicates,
  getPipelineHealthSummary,
} from "../../feature-analytics";
import { checkExistingCapability } from "../../feature-education";
import { ingestFeatureRequest, type FeatureSource } from "../../feature-intake";
import {
  dispatchAiReview,
  dispatchCodeImplementation,
  dispatchPrdGeneration,
  dispatchTaskGeneration,
} from "../../inngest/dispatch";
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
} from "../../review";
import { assertReleaseReviewer } from "../../workflow-guards";
import {
  getGithubConnectionForUser,
  listGithubRepositoriesForUser,
  syncGithubInstallationForUser,
} from "../../github/installation";
import { explainEngineeringTaskForUser, advanceTaskWalkthroughForUser } from "../../task-walkthrough";
import { FEATURE_STATUSES, ENGINEERING_TASK_STATUSES } from "../../workflow";

import type { ShipflowToolContext } from "../definitions";
import { featureSummary, loadAuthorizedFeature } from "../helpers";

export async function handle_get_workspace(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_list_feature_requests(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_get_feature_request(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_create_feature_request(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_triage_feature_request(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_add_clarification(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const content = String(args.content ?? "").trim();
        if (!content) return JSON.stringify({ error: "content is required" });
        await loadAuthorizedFeature(userId, id);
        const role = args.role === "user" ? "user" : "agent";
        const row = await addClarificationMessage({ featureRequestId: id, role, content });
        if (role === "user") {
          await transitionFeatureStatus(id, "clarifying");
        }
        return JSON.stringify({ id: row.id, featureRequestId: id, role, content: row.content });
}

export async function handle_update_feature_status(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  return JSON.stringify({
          error:
            "Direct status updates are disabled. Use generate_feature_prd, generate_feature_tasks, run_ai_review, approve_feature, or ship_feature.",
        });
}

export async function handle_get_pipeline_summary(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_check_existing_capability(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_intake_from_channel(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_get_feature_delivery(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_update_engineering_task_status(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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
