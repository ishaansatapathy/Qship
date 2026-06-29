import { and, eq } from "@repo/database";
import db from "@repo/database";
import { featureRequests, organizations, pullRequests, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { appendFeatureActivity, transitionFeatureStatus } from "../feature-request";
import { invalidateInstallationCache } from "./client";
import { runPullRequestAiReview } from "./pr-review";
import { isGithubDeliveryDuplicate } from "./webhook-dedup";

// ── Feature-linking conventions ───────────────────────────────────────────────

/** Branch name pattern: `shipflow/<uuid>` */
const FEATURE_BRANCH_RE = /^shipflow\/([0-9a-f-]{36})$/i;
/** PR body / title tag: `ShipFlow-Feature: <uuid>` */
const FEATURE_TAG_RE = /ShipFlow-Feature:\s*([0-9a-f-]{36})/i;

function extractFeatureId(pr: { head?: { ref?: string }; body?: string | null }): string | null {
  return extractFeatureIdFromPullRequest(pr);
}

/** Exported for tests and tooling — links PRs to ShipFlow features. */
export function extractFeatureIdFromPullRequest(pr: {
  head?: { ref?: string };
  body?: string | null;
}): string | null {
  const branchMatch = pr.head?.ref?.match(FEATURE_BRANCH_RE);
  if (branchMatch?.[1]) return branchMatch[1];

  const tagMatch = (pr.body ?? "").match(FEATURE_TAG_RE);
  return tagMatch?.[1] ?? null;
}

// ── pull_request event ────────────────────────────────────────────────────────

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
    merged?: boolean;
    head?: { sha?: string; ref?: string };
    base?: { ref?: string };
    body?: string | null;
  };
};

export async function processGithubPullRequestWebhook(
  payload: GithubPullRequestPayload,
  deliveryId = "unknown",
) {
  if (await isGithubDeliveryDuplicate(deliveryId, "pull_request")) {
    logger.info("webhook.pull_request.duplicate_skipped", { deliveryId });
    return { handled: false, reason: "duplicate_delivery" as const };
  }

  const action = payload.action ?? "unknown";
  const pr = payload.pull_request;
  const repoMeta = payload.repository;
  const installationId = payload.installation?.id;

  if (!pr?.id || !pr.number || !repoMeta?.id || !installationId) {
    return { handled: false, reason: "missing_fields" as const };
  }

  const HANDLED_ACTIONS = ["opened", "reopened", "synchronize", "closed", "edited"];
  if (!HANDLED_ACTIONS.includes(action)) {
    return { handled: false, reason: "ignored_action" as const, action };
  }

  // ── Org lookup ────────────────────────────────────────────────────────────────
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.githubInstallationId, String(installationId)),
  });
  if (!org) {
    logger.warn("webhook.pull_request.unknown_installation", { installationId });
    return { handled: false, reason: "unknown_installation" as const };
  }

  // ── Repo lookup ───────────────────────────────────────────────────────────────
  const repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.organizationId, org.id),
      eq(repositories.githubRepoId, String(repoMeta.id)),
    ),
  });
  if (!repoRow) {
    logger.info("webhook.pull_request.repo_not_synced", {
      fullName: repoMeta.full_name,
      orgId: org.id,
    });
    return { handled: false, reason: "repo_not_synced" as const };
  }

  // ── Feature linking ───────────────────────────────────────────────────────────
  const featureId = extractFeatureId(pr);
  if (!featureId) {
    return {
      handled: true,
      linked: false,
      action,
      hint: 'Link by naming the branch "shipflow/<feature-uuid>" or adding "ShipFlow-Feature: <uuid>" to the PR body',
    };
  }

  const feature = await db.query.featureRequests.findFirst({
    where: and(
      eq(featureRequests.id, featureId),
      eq(featureRequests.organizationId, org.id),
    ),
  });
  if (!feature) {
    logger.info("webhook.pull_request.feature_not_in_org", { featureId, orgId: org.id });
    return { handled: true, linked: false, reason: "feature_not_in_org" as const };
  }

  // ── Derive PR state ───────────────────────────────────────────────────────────
  const isMerged = action === "closed" && pr.merged === true;
  const isClosed = action === "closed" && !isMerged;
  const state = isMerged ? "merged" : isClosed ? "closed" : (pr.state ?? "open");

  // ── Upsert pull_requests record ───────────────────────────────────────────────
  const prId = `${org.id}-pr-${pr.id}`;
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

  // ── Feature status transitions ────────────────────────────────────────────────
  if (isMerged) {
    // Transition to human_review — human sign-off is required before approved.
    // Only skip this gate if a human approval is already on record (e.g. pre-approved and then merged).
    const { humanApprovals: humanApprovalsTable } = await import("@repo/database/schema");
    const { eq: eqOp } = await import("@repo/database");
    const existingApproval = await db.query.humanApprovals.findFirst({
      where: eqOp(humanApprovalsTable.featureRequestId, feature.id),
    });

    if (existingApproval?.decision === "approved") {
      // Already approved by a human — mark shipped-ready.
      await transitionFeatureStatus(feature.id, "approved");
      await appendFeatureActivity(feature.id, {
        kind: "status",
        title: "Pull request merged (pre-approved)",
        detail: `#${pr.number} merged · human approval already on record`,
        actor: "system",
      });
    } else {
      // Gate the feature at human_review — PM must confirm before approved.
      await transitionFeatureStatus(feature.id, "human_review");
      await appendFeatureActivity(feature.id, {
        kind: "status",
        title: "Pull request merged — awaiting human approval",
        detail: `#${pr.number} merged into ${pr.base?.ref ?? "main"} · ${repoMeta.full_name} · PM sign-off required`,
        actor: "system",
      });
    }
    logger.info("webhook.pull_request.merged", {
      featureId: feature.id,
      prNumber: pr.number,
      orgId: org.id,
      hadExistingApproval: Boolean(existingApproval),
    });
    return { handled: true, linked: true, action, featureId: feature.id, pullRequestId: prId, state };
  }

  if (isClosed) {
    await appendFeatureActivity(feature.id, {
      kind: "status",
      title: "Pull request closed without merge",
      detail: `#${pr.number} closed · ${repoMeta.full_name}`,
      actor: "system",
    });
    return { handled: true, linked: true, action, featureId: feature.id, pullRequestId: prId, state };
  }

  // ── Open / sync — update status + trigger AI review ──────────────────────────
  if (["opened", "reopened", "synchronize"].includes(action)) {
    await transitionFeatureStatus(feature.id, "pr_open");
    await appendFeatureActivity(feature.id, {
      kind: "status",
      title: action === "synchronize" ? "Pull request updated" : "Pull request linked",
      detail: `${pr.title ?? `#${pr.number}`} · ${repoMeta.full_name}`,
      actor: "system",
    });

    // AI review is fire-and-forget; errors are logged but never surface to GitHub.
    void runPullRequestAiReview(prId).catch((error) => {
      logger.error("webhook.pull_request.auto_review_failed", {
        featureId: feature.id,
        prId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return {
    handled: true,
    linked: true,
    action,
    featureId: feature.id,
    pullRequestId: prId,
    prNumber: pr.number,
    state,
  };
}

// ── installation event ────────────────────────────────────────────────────────

type GithubInstallationPayload = {
  action?: string;
  installation?: {
    id?: number;
    account?: { login?: string; type?: string };
  };
  repositories_removed?: Array<{ id?: number; full_name?: string }>;
  repositories_added?: Array<{ id?: number; full_name?: string }>;
};

/**
 * Handles GitHub App `installation` and `installation_repositories` events.
 * - `deleted` → clears the installation link from the org record
 * - `repositories_removed` → removes unlinked repos from the DB
 *
 * Repository additions are handled lazily on the next connection status check.
 */
export async function processGithubInstallationWebhook(
  payload: GithubInstallationPayload,
  deliveryId = "unknown",
) {
  if (await isGithubDeliveryDuplicate(deliveryId, "installation")) {
    return { handled: false, reason: "duplicate_delivery" as const };
  }

  const action = payload.action ?? "unknown";
  const installation = payload.installation;
  if (!installation?.id) {
    return { handled: false, reason: "missing_installation_id" as const };
  }

  const installationId = String(installation.id);

  if (action === "deleted") {
    // Evict the cached Octokit so future calls do not attempt to use a revoked token.
    invalidateInstallationCache(installationId);

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.githubInstallationId, installationId),
    });

    if (org) {
      await db
        .update(organizations)
        .set({ githubInstallationId: null, githubAccountLogin: null, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));

      logger.info("webhook.installation.deleted", {
        installationId,
        orgId: org.id,
      });
    }

    return { handled: true, action, installationId };
  }

  if (action === "removed" && payload.repositories_removed?.length) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.githubInstallationId, installationId),
    });

    if (org) {
      for (const removedRepo of payload.repositories_removed) {
        if (!removedRepo.id) continue;
        await db
          .delete(repositories)
          .where(
            and(
              eq(repositories.organizationId, org.id),
              eq(repositories.githubRepoId, String(removedRepo.id)),
            ),
          );
        logger.info("webhook.installation.repo_removed", {
          orgId: org.id,
          repoFullName: removedRepo.full_name,
        });
      }
    }

    return { handled: true, action, installationId };
  }

  return { handled: false, reason: "ignored_action" as const, action };
}
