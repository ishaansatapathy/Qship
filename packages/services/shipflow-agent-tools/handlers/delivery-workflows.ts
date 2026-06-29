import {
  dispatchCodeImplementation,
  dispatchPrdGeneration,
  dispatchTaskGeneration,
} from "../../inngest/dispatch";
import { getGithubConnectionForUser } from "../../github/installation";

import type { ShipflowToolContext } from "../definitions";
import { loadAuthorizedFeature } from "../helpers";

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
