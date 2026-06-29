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

export async function handle_generate_feature_prd(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_generate_feature_tasks(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_implement_feature_code(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const repositoryId = String(args.repositoryId ?? "").trim();
        if (!repositoryId) return JSON.stringify({ error: "repositoryId is required" });

        const { feature, ws } = await loadAuthorizedFeature(userId, id);
        if (!feature.prd?.content) {
          return JSON.stringify({ error: "Generate a PRD first (generate_feature_prd)" });
        }
        if (!feature.tasks?.length) {
          return JSON.stringify({ error: "Generate tasks first (generate_feature_tasks)" });
        }

        const gh = await getGithubConnectionForUser(userId);
        if (!gh.connected || !gh.installationId) {
          return JSON.stringify({ error: "Connect GitHub in Settings first" });
        }

        const dispatch = await dispatchCodeImplementation({
          featureId: id,
          userId,
          organizationId: ws.organization.id,
          installationId: gh.installationId,
          repositoryId,
        });

        actions.push({
          kind: "feature_detail",
          title: `Implementing: ${feature.title}`,
          detail: "AI code generation queued",
          href: `/requests?id=${id}`,
        });

        return JSON.stringify({
          featureId: id,
          workflowRunId: dispatch.workflowRunId,
          mode: dispatch.mode,
          message: "Code implementation queued — commits + PR will open when complete",
        });
}
