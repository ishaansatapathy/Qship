import {
  assertTaskInUserWorkspace,
  getFeatureRequest,
  getPipelineSummary,
  getWorkspaceProjectForUser,
} from "../../feature-request";
import { generateDeveloperOnboardingGuide } from "../../feature-ai";
import {
  checkPipelineDuplicates,
  getPipelineHealthSummary,
  predictDeliveryTimeline,
} from "../../feature-analytics";
import {
  getGithubConnectionForUser,
  listGithubRepositoriesForUser,
  syncGithubInstallationForUser,
} from "../../github/installation";

import type { ShipflowToolContext } from "../definitions";
import { loadAuthorizedFeature } from "../helpers";

export async function handle_github_connection_status(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId } = ctx;
  await syncGithubInstallationForUser(userId).catch(() => undefined);
        const status = await getGithubConnectionForUser(userId);
        return JSON.stringify(status);
}

export async function handle_list_github_repositories(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_predict_delivery_timeline(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_check_pipeline_duplicates(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_get_pipeline_health(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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

export async function handle_get_developer_onboarding_guide(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
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
