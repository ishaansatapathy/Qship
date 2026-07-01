import { and, desc, eq } from "@repo/database";
import db from "@repo/database";
import { featureRequests, organizations, pullRequests, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { appendFeatureActivity, transitionFeatureStatus } from "../feature-request";
import { invalidateInstallationCache } from "./client";
import { syncInstallationRepositoriesForOrg } from "./installation";
import { dispatchWebhookPullRequestAiReview } from "./webhook-pr-review-dispatch";
import { isGithubDeliveryDuplicate } from "./webhook-dedup";

// ── Feature-linking conventions ───────────────────────────────────────────────

/** Branch name pattern: `shipflow/<uuid>` */
const FEATURE_BRANCH_RE = /^shipflow\/([0-9a-f-]{36})$/i;
/** PR body / title tag: `Qship-Feature: <uuid>` (legacy `ShipFlow-Feature` also accepted) */
const FEATURE_TAG_RE = /(?:Qship|ShipFlow)-Feature:\s*([0-9a-f-]{36})/i;

function extractFeatureId(pr: { head?: { ref?: string }; body?: string | null }): string | null {
  return extractFeatureIdFromPullRequest(pr);
}

/** Exported for tests and tooling — links PRs to ShipFlow features. */
export function extractFeatureIdFromBranchName(branchName: string): string | null {
  const normalized = branchName.trim().replace(/^refs\/heads\//, "");
  const branchMatch = normalized.match(FEATURE_BRANCH_RE);
  return branchMatch?.[1] ?? null;
}

/** Exported for tests and tooling — links PRs to ShipFlow features. */
export function extractFeatureIdFromPullRequest(pr: {
  head?: { ref?: string };
  body?: string | null;
}): string | null {
  const fromBranch = pr.head?.ref ? extractFeatureIdFromBranchName(pr.head.ref) : null;
  if (fromBranch) return fromBranch;

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

export type WebhookProcessorOpts = {
  /**
   * Set to true when called from the outbox retry path.
   * The outbox has its own unique constraint dedup — bypassing the per-delivery
   * dedup check prevents a caught mid-flight failure from permanently blocking
   * retries (the dedup row is written at the start of the first attempt, so
   * without this flag every outbox retry would look like a duplicate and be
   * silently dropped).
   */
  skipDedup?: boolean;
};

export async function processGithubPullRequestWebhook(
  payload: GithubPullRequestPayload,
  deliveryId = "unknown",
  opts?: WebhookProcessorOpts,
) {
  if (!opts?.skipDedup && await isGithubDeliveryDuplicate(deliveryId, "pull_request")) {
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

  // ── Repo lookup (auto-sync once when missing) ───────────────────────────────
  let repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.organizationId, org.id),
      eq(repositories.githubRepoId, String(repoMeta.id)),
    ),
  });

  let autoSynced = false;
  if (!repoRow) {
    logger.warn("webhook.pull_request.repo_not_synced", {
      fullName: repoMeta.full_name,
      orgId: org.id,
      githubRepoId: repoMeta.id,
      action: "auto_sync_attempt",
    });
    try {
      await syncInstallationRepositoriesForOrg(org.id, String(installationId));
      autoSynced = true;
      repoRow = await db.query.repositories.findFirst({
        where: and(
          eq(repositories.organizationId, org.id),
          eq(repositories.githubRepoId, String(repoMeta.id)),
        ),
      });
    } catch (error) {
      logger.error("webhook.pull_request.repo_sync_failed", {
        fullName: repoMeta.full_name,
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!repoRow) {
    return {
      handled: false,
      reason: "repo_not_synced" as const,
      autoSynced,
      operatorAction: "sync_repositories",
      message: `Repository ${repoMeta.full_name ?? repoMeta.id} is not linked. Sync repositories in Settings → GitHub.`,
    };
  }

  // ── Feature linking ───────────────────────────────────────────────────────────
  const featureId = extractFeatureId(pr);
  if (!featureId) {
    return {
      handled: true,
      linked: false,
      action,
      hint: 'Link by naming the branch "shipflow/<feature-uuid>" or adding "Qship-Feature: <uuid>" to the PR body',
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

    // Queue AI review asynchronously — never block the GitHub webhook response.
    const headSha = pr.head?.sha ?? "unknown";
    void dispatchWebhookPullRequestAiReview({
      pullRequestId: prId,
      featureId: feature.id,
      headSha,
    }).catch((error) => {
      logger.error("webhook.pull_request.review_queue_failed", {
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
    autoSynced: autoSynced || undefined,
  };
}

// ── push event ────────────────────────────────────────────────────────────────

const ZERO_SHA = "0000000000000000000000000000000000000000";

type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  forced?: boolean;
  installation?: { id?: number };
  repository?: { id?: number; full_name?: string };
  pusher?: { name?: string; email?: string };
  commits?: Array<{ id?: string; message?: string }>;
};

/**
 * Handles `push` events on `shipflow/<feature-uuid>` branches.
 * Links the push to a feature, updates open PR head SHA when present,
 * and queues AI re-review (same path as pull_request.synchronize).
 */
export async function processGithubPushWebhook(
  payload: GithubPushPayload,
  deliveryId = "unknown",
  opts?: WebhookProcessorOpts,
) {
  if (!opts?.skipDedup && (await isGithubDeliveryDuplicate(deliveryId, "push"))) {
    logger.info("webhook.push.duplicate_skipped", { deliveryId });
    return { handled: false, reason: "duplicate_delivery" as const };
  }

  const ref = payload.ref ?? "";
  const afterSha = payload.after ?? "";
  const repoMeta = payload.repository;
  const installationId = payload.installation?.id;

  if (!ref.startsWith("refs/heads/") || !repoMeta?.id || !installationId) {
    return { handled: false, reason: "missing_fields" as const };
  }

  if (payload.deleted || afterSha === ZERO_SHA) {
    return { handled: true, linked: false, reason: "branch_deleted" as const };
  }

  const branchName = ref.replace(/^refs\/heads\//, "");
  const featureId = extractFeatureIdFromBranchName(branchName);
  if (!featureId) {
    return {
      handled: true,
      linked: false,
      reason: "unlinked_branch" as const,
      hint: 'Only branches named "shipflow/<feature-uuid>" are linked to Qship features',
    };
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.githubInstallationId, String(installationId)),
  });
  if (!org) {
    logger.warn("webhook.push.unknown_installation", { installationId });
    return { handled: false, reason: "unknown_installation" as const };
  }

  let repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.organizationId, org.id),
      eq(repositories.githubRepoId, String(repoMeta.id)),
    ),
  });

  let autoSynced = false;
  if (!repoRow) {
    logger.warn("webhook.push.repo_not_synced", {
      fullName: repoMeta.full_name,
      orgId: org.id,
      githubRepoId: repoMeta.id,
      action: "auto_sync_attempt",
    });
    try {
      await syncInstallationRepositoriesForOrg(org.id, String(installationId));
      autoSynced = true;
      repoRow = await db.query.repositories.findFirst({
        where: and(
          eq(repositories.organizationId, org.id),
          eq(repositories.githubRepoId, String(repoMeta.id)),
        ),
      });
    } catch (error) {
      logger.error("webhook.push.repo_sync_failed", {
        fullName: repoMeta.full_name,
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!repoRow) {
    return {
      handled: false,
      reason: "repo_not_synced" as const,
      autoSynced,
      operatorAction: "sync_repositories",
      message: `Repository ${repoMeta.full_name ?? repoMeta.id} is not linked. Sync repositories in Settings → GitHub.`,
    };
  }

  const feature = await db.query.featureRequests.findFirst({
    where: and(
      eq(featureRequests.id, featureId),
      eq(featureRequests.organizationId, org.id),
    ),
  });
  if (!feature) {
    logger.info("webhook.push.feature_not_in_org", { featureId, orgId: org.id });
    return { handled: true, linked: false, reason: "feature_not_in_org" as const };
  }

  const commitCount = payload.commits?.length ?? 0;
  const pusher = payload.pusher?.name ?? "someone";
  await appendFeatureActivity(feature.id, {
    kind: "status",
    title: "Feature branch updated",
    detail: `${branchName} · ${commitCount} commit(s) by ${pusher} · ${afterSha.slice(0, 7)}`,
    actor: "system",
  });

  const openPr = await db.query.pullRequests.findFirst({
    where: and(
      eq(pullRequests.featureRequestId, feature.id),
      eq(pullRequests.repositoryId, repoRow.id),
      eq(pullRequests.state, "open"),
    ),
    orderBy: [desc(pullRequests.updatedAt)],
  });

  if (openPr) {
    await db
      .update(pullRequests)
      .set({ headSha: afterSha, updatedAt: new Date() })
      .where(eq(pullRequests.id, openPr.id));

    await transitionFeatureStatus(feature.id, "pr_open");

    void dispatchWebhookPullRequestAiReview({
      pullRequestId: openPr.id,
      featureId: feature.id,
      headSha: afterSha,
    }).catch((error) => {
      logger.error("webhook.push.review_queue_failed", {
        featureId: feature.id,
        pullRequestId: openPr.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info("webhook.push.linked_with_pr", {
      featureId: feature.id,
      prNumber: openPr.githubPrNumber,
      headSha: afterSha.slice(0, 12),
    });

    return {
      handled: true,
      linked: true,
      featureId: feature.id,
      pullRequestId: openPr.id,
      prNumber: openPr.githubPrNumber,
      reviewQueued: true,
      autoSynced: autoSynced || undefined,
    };
  }

  if (["planning", "plan_approved", "prd_ready"].includes(feature.status)) {
    await transitionFeatureStatus(feature.id, "in_development");
  }

  logger.info("webhook.push.linked_without_pr", {
    featureId: feature.id,
    branch: branchName,
    headSha: afterSha.slice(0, 12),
  });

  return {
    handled: true,
    linked: true,
    featureId: feature.id,
    reviewQueued: false,
    hint: "Open a pull request from this branch to trigger AI review",
    autoSynced: autoSynced || undefined,
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
  opts?: WebhookProcessorOpts,
) {
  if (!opts?.skipDedup && await isGithubDeliveryDuplicate(deliveryId, "installation")) {
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
