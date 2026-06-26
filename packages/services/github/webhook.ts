import { and, eq } from "@repo/database";
import db from "@repo/database";
import { featureRequests, organizations, pullRequests, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { appendFeatureActivity } from "../feature-request";
import { runPullRequestAiReview } from "./pr-review";

const FEATURE_BRANCH = /^shipflow\/([0-9a-f-]{36})$/i;
const FEATURE_TAG = /ShipFlow-Feature:\s*([0-9a-f-]{36})/i;

type GithubPullRequestPayload = {
  action?: string;
  installation?: { id?: number };
  repository?: { id?: number; full_name?: string };
  pull_request?: {
    id?: number;
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    head?: { sha?: string; ref?: string };
    base?: { ref?: string };
    body?: string | null;
  };
};

function extractFeatureId(pr: NonNullable<GithubPullRequestPayload["pull_request"]>) {
  const branchMatch = pr.head?.ref?.match(FEATURE_BRANCH);
  if (branchMatch?.[1]) return branchMatch[1];

  const body = pr.body ?? "";
  const tagMatch = body.match(FEATURE_TAG);
  if (tagMatch?.[1]) return tagMatch[1];

  return null;
}

export async function processGithubPullRequestWebhook(payload: GithubPullRequestPayload) {
  const action = payload.action ?? "unknown";
  const pr = payload.pull_request;
  const repoMeta = payload.repository;
  const installationId = payload.installation?.id;

  if (!pr?.id || !pr.number || !repoMeta?.id || !installationId) {
    return { handled: false, reason: "missing_fields" as const };
  }

  if (!["opened", "reopened", "synchronize", "closed", "edited"].includes(action)) {
    return { handled: false, reason: "ignored_action" as const, action };
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.githubInstallationId, String(installationId)),
  });
  if (!org) {
    logger.warn("GitHub webhook: no org for installation", { installationId });
    return { handled: false, reason: "unknown_installation" as const };
  }

  const repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.organizationId, org.id),
      eq(repositories.githubRepoId, String(repoMeta.id)),
    ),
  });
  if (!repoRow) {
    logger.info("GitHub webhook: repo not synced yet", { fullName: repoMeta.full_name });
    return { handled: false, reason: "repo_not_synced" as const };
  }

  const featureId = extractFeatureId(pr);
  if (!featureId) {
    return {
      handled: true,
      linked: false,
      action,
      hint: "Use branch shipflow/<feature-uuid> or PR body ShipFlow-Feature: <uuid> to link",
    };
  }

  const feature = await db.query.featureRequests.findFirst({
    where: and(eq(featureRequests.id, featureId), eq(featureRequests.organizationId, org.id)),
  });
  if (!feature) {
    return { handled: true, linked: false, reason: "feature_not_in_org" as const };
  }

  const prId = `${org.id}-pr-${pr.id}`;
  const state = pr.state === "closed" && action === "closed" ? "closed" : pr.state ?? "open";

  await db
    .insert(pullRequests)
    .values({
      id: prId,
      featureRequestId: feature.id,
      repositoryId: repoRow.id,
      githubPrNumber: pr.number,
      githubPrId: String(pr.id),
      title: pr.title ?? `PR #${pr.number}`,
      url: pr.html_url ?? "",
      headSha: pr.head?.sha ?? "",
      baseBranch: pr.base?.ref ?? "main",
      state,
    })
    .onConflictDoUpdate({
      target: pullRequests.id,
      set: {
        title: pr.title ?? `PR #${pr.number}`,
        url: pr.html_url ?? "",
        headSha: pr.head?.sha ?? "",
        state,
        updatedAt: new Date(),
      },
    });

  if (state === "open" && ["opened", "reopened", "synchronize"].includes(action)) {
    await db
      .update(featureRequests)
      .set({ status: "pr_open", updatedAt: new Date() })
      .where(eq(featureRequests.id, feature.id));

    await appendFeatureActivity(feature.id, {
      kind: "status",
      title: "Pull request linked",
      detail: `${pr.title ?? `#${pr.number}`} · ${repoMeta.full_name}`,
      actor: "system",
    });

    if (action === "synchronize" || action === "opened" || action === "reopened") {
      void runPullRequestAiReview(prId).catch((error) => {
        logger.warn("GitHub webhook: auto review failed", {
          featureId: feature.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  return {
    handled: true,
    linked: true,
    action,
    featureId: feature.id,
    pullRequestId: prId,
    prNumber: pr.number,
  };
}
