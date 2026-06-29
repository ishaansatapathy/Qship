import crypto from "node:crypto";

import { db, eq } from "@repo/database";
import { organizations, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "../errors";
import { ensurePersonalWorkspace, getMembershipForUser } from "../organization";
import { getAppOctokit, getInstallationOctokit } from "./client";
import { getGithubAppConfig, isGithubAppConfigured, isGithubWebhookConfigured } from "./config";
import { rethrowGithubSyncError } from "./sync-errors";
import { isProductionEnv } from "../runtime-env";

const INSTALL_STATE_TTL_MS = 15 * 60 * 1000;

function getInstallStateSecret(): string {
  const { webhookSecret } = getGithubAppConfig();
  if (webhookSecret) return webhookSecret;
  if (isProductionEnv()) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "GITHUB_WEBHOOK_SECRET is required to sign GitHub install state in production",
    );
  }
  return (
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "shipflow-dev-install-state"
  );
}

type SignedInstallStatePayload = GithubInstallState & {
  nonce: string;
  issuedAt: number;
};

// ── Install state encoding ────────────────────────────────────────────────────

export type GithubInstallState = {
  organizationId: string;
  returnTo?: string;
  /** CSRF nonce to verify the callback came from a ShipFlow-initiated flow. */
  nonce?: string;
};

export function encodeGithubInstallState(state: GithubInstallState): string {
  const payload: SignedInstallStatePayload = {
    organizationId: state.organizationId,
    returnTo: state.returnTo,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getInstallStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function decodeGithubInstallState(raw: string | null | undefined): GithubInstallState | null {
  if (!raw?.trim()) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const encoded = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getInstallStateSecret()).update(encoded).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SignedInstallStatePayload;
    if (!parsed.organizationId || !parsed.nonce || typeof parsed.issuedAt !== "number") return null;
    if (Date.now() - parsed.issuedAt > INSTALL_STATE_TTL_MS) return null;
    return {
      organizationId: parsed.organizationId,
      returnTo: parsed.returnTo,
      nonce: parsed.nonce,
    };
  } catch {
    return null;
  }
}

export function buildGithubInstallUrl(params: { organizationId: string; returnTo?: string }): string {
  const { appSlug } = getGithubAppConfig();
  if (!isGithubAppConfigured() || !appSlug) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub App is not configured");
  }
  if (isProductionEnv() && !isGithubWebhookConfigured()) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "GITHUB_WEBHOOK_SECRET is required to sign GitHub install state in production",
    );
  }

  const state = encodeGithubInstallState({
    organizationId: params.organizationId,
    returnTo: params.returnTo,
  });
  return `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

// ── Repository sync ───────────────────────────────────────────────────────────

/**
 * Fetches all repositories accessible to the installation using Octokit's
 * built-in `paginate` helper (handles multi-page responses automatically),
 * then upserts each repo in a single operation per record.
 *
 * Also removes repositories that were revoked since the last sync.
 */
export async function syncInstallationRepositoriesForOrg(
  organizationId: string,
  installationId: string,
): Promise<void> {
  return syncInstallationRepositories(organizationId, installationId);
}

async function syncInstallationRepositories(
  organizationId: string,
  installationId: string,
): Promise<void> {
  try {
    const octokit = getInstallationOctokit(installationId);

    // Paginate to handle organisations with more than 100 repositories.
    const ghRepos = await octokit.paginate(
      octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
      (response) => response.data,
    );

    const ghRepoIds = new Set(ghRepos.map((r) => String(r.id)));

    // Fetch existing records for this org in one query.
    const existing = await db.query.repositories.findMany({
      where: eq(repositories.organizationId, organizationId),
      columns: { id: true, githubRepoId: true },
    });

    const existingByGhId = new Map(existing.map((r) => [r.githubRepoId, r.id]));

    const currentOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { githubAccountLogin: true },
    });

    for (const repo of ghRepos) {
      const fullName = repo.full_name?.trim();
      const ownerLogin = repo.owner?.login?.trim();
      if (!fullName || !ownerLogin || !repo.name) {
        logger.warn("github.installation.repo_skipped", {
          organizationId,
          githubRepoId: repo.id,
          reason: "missing_metadata",
        });
        continue;
      }

      await clearStaleRepositoryClaim({
        organizationId,
        fullName,
        installationId,
        currentAccountLogin: currentOrg?.githubAccountLogin ?? null,
      });

      const repoId = String(repo.id);
      const rowId = existingByGhId.get(repoId) ?? `${organizationId}-repo-${repoId}`;

      await db
        .insert(repositories)
        .values({
          id: rowId,
          organizationId,
          githubInstallationId: installationId,
          githubRepoId: repoId,
          owner: ownerLogin,
          name: repo.name,
          fullName,
          defaultBranch: repo.default_branch ?? "main",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: repositories.id,
          set: {
            githubInstallationId: installationId,
            owner: ownerLogin,
            name: repo.name,
            fullName,
            defaultBranch: repo.default_branch ?? "main",
            updatedAt: new Date(),
          },
        });
    }

    // Remove repositories that are no longer accessible to the installation.
    for (const row of existing) {
      if (!ghRepoIds.has(row.githubRepoId)) {
        await db.delete(repositories).where(eq(repositories.id, row.id));
        logger.info("github.installation.repo_removed", {
          organizationId,
          githubRepoId: row.githubRepoId,
        });
      }
    }

    logger.info("github.installation.repos_synced", {
      organizationId,
      installationId,
      count: ghRepos.length,
    });
  } catch (error) {
    rethrowGithubSyncError(error);
  }
}

/** Drops or reclaims repo rows that block sync because full_name is globally unique. */
async function clearStaleRepositoryClaim(params: {
  organizationId: string;
  fullName: string;
  installationId: string;
  currentAccountLogin: string | null;
}) {
  const { organizationId, fullName, installationId, currentAccountLogin } = params;
  const existing = await db.query.repositories.findFirst({
    where: eq(repositories.fullName, fullName),
    columns: { id: true, organizationId: true, githubInstallationId: true },
  });
  if (!existing || existing.organizationId === organizationId) return;

  const otherOrg = await db.query.organizations.findFirst({
    where: eq(organizations.id, existing.organizationId),
    columns: { githubInstallationId: true, githubAccountLogin: true },
  });

  const sameInstallation =
    existing.githubInstallationId === installationId ||
    otherOrg?.githubInstallationId === installationId;
  const sameGithubAccount =
    Boolean(currentAccountLogin) &&
    Boolean(otherOrg?.githubAccountLogin) &&
    otherOrg.githubAccountLogin === currentAccountLogin;
  const otherOrgDisconnected = !otherOrg?.githubInstallationId;

  if (!sameInstallation && !sameGithubAccount && !otherOrgDisconnected) {
    throw new ServiceError(
      "CONFLICT",
      `Repository ${fullName} is already linked to another workspace. Disconnect GitHub there first, then sync again.`,
    );
  }

  await db.delete(repositories).where(eq(repositories.id, existing.id));
  logger.warn("github.installation.repo_claim_cleared", {
    fullName,
    fromOrganizationId: existing.organizationId,
    toOrganizationId: organizationId,
    reason: sameInstallation
      ? "same_installation"
      : sameGithubAccount
        ? "same_github_account"
        : "other_org_disconnected",
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function linkInstallationToOrg(
  organizationId: string,
  installationId: string,
): Promise<{ installationId: string; accountLogin: string | null }> {
  const octokit = getInstallationOctokit(installationId);
  const { data: installation } = await octokit.rest.apps.getInstallation({
    installation_id: Number(installationId),
  });

  const accountLogin =
    installation.account && "login" in installation.account
      ? (installation.account.login ?? null)
      : null;

  await db
    .update(organizations)
    .set({ githubInstallationId: installationId, githubAccountLogin: accountLogin, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  await syncInstallationRepositories(organizationId, installationId);

  logger.info("github.installation.linked", { organizationId, installationId, accountLogin });
  return { installationId, accountLogin };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the GitHub connection status for the user's workspace and
 * opportunistically refreshes the repository list in the background.
 */
export async function getGithubConnectionForUser(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    return {
      connected: false as const,
      configured: isGithubAppConfigured(),
      accountLogin: null,
      repositoryCount: 0,
    };
  }

  const org = membership.organization;

  // Background refresh — errors are intentionally swallowed so a GitHub API
  // hiccup never breaks the settings page load.
  if (org.githubInstallationId && isGithubAppConfigured()) {
    await syncInstallationRepositories(org.id, org.githubInstallationId).catch(() => undefined);
  } else if (isGithubAppConfigured()) {
    await syncGithubInstallationForUser(userId).catch(() => undefined);
  }

  const refreshed = await getMembershipForUser(userId);
  const updatedOrg = refreshed?.organization ?? org;
  const orgRepos = await db.query.repositories.findMany({
    where: eq(repositories.organizationId, updatedOrg.id),
  });

  return {
    connected: Boolean(updatedOrg.githubInstallationId),
    configured: isGithubAppConfigured(),
    accountLogin: updatedOrg.githubAccountLogin ?? null,
    installationId: updatedOrg.githubInstallationId ?? null,
    repositoryCount: orgRepos.length,
  };
}

/**
 * Discovers and links an existing GitHub App installation to the user's
 * workspace. Useful when the app was installed directly from GitHub's UI
 * rather than via the ShipFlow callback URL.
 */
export async function syncGithubInstallationForUser(userId: string) {
  if (!isGithubAppConfigured()) {
    return { synced: false as const, connected: false as const, reason: "not_configured" as const };
  }

  const membership =
    (await getMembershipForUser(userId)) ?? (await ensurePersonalWorkspace(userId));
  const org = membership.organization;

  if (org.githubInstallationId) {
    await syncInstallationRepositories(org.id, org.githubInstallationId);
    return {
      synced: true as const,
      connected: true as const,
      installationId: org.githubInstallationId,
      accountLogin: org.githubAccountLogin,
    };
  }

  // List all App installations to find a matching one.
  const app = getAppOctokit();
  const installations = await app.paginate(app.rest.apps.listInstallations, { per_page: 100 });

  if (installations.length === 0) {
    return { synced: false as const, connected: false as const, reason: "no_installations" as const };
  }

  // Prefer user-type installations (personal accounts) over org installations.
  const pick =
    installations.length === 1
      ? installations[0]
      : (installations.find(
          (i) => i.account && "type" in i.account && i.account.type === "User",
        ) ?? installations[0]);

  if (!pick?.id) {
    return { synced: false as const, connected: false as const, reason: "no_installations" as const };
  }

  const linked = await linkInstallationToOrg(org.id, String(pick.id));
  return {
    synced: true as const,
    connected: true as const,
    installationId: linked.installationId,
    accountLogin: linked.accountLogin,
  };
}

/**
 * Handles the GitHub App installation callback redirect.
 * Verifies the `state` parameter, links the installation to the workspace, and
 * returns the redirect target.
 */
export async function completeGithubInstallation(params: {
  userId: string;
  installationId: string;
  state?: string | null;
}) {
  const membership = await getMembershipForUser(params.userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before connecting GitHub");
  }

  const decodedState = decodeGithubInstallState(params.state);
  if (!decodedState?.nonce) {
    throw new ServiceError(
      "FORBIDDEN",
      "Invalid or expired GitHub install state — start connect from Settings again",
    );
  }

  const organizationId = decodedState.organizationId;

  if (organizationId !== membership.organizationId) {
    throw new ServiceError("FORBIDDEN", "You can only connect GitHub to your own workspace");
  }

  const { accountLogin } = await linkInstallationToOrg(organizationId, params.installationId);

  return {
    organizationId,
    installationId: params.installationId,
    accountLogin,
    returnTo: decodedState?.returnTo ?? "/settings",
  };
}

/**
 * Disconnects GitHub from the workspace: clears the installation link and
 * removes all synced repository records.
 */
export async function disconnectGithubForUser(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "No workspace found");
  }

  await db
    .update(organizations)
    .set({ githubInstallationId: null, githubAccountLogin: null, updatedAt: new Date() })
    .where(eq(organizations.id, membership.organizationId));

  await db.delete(repositories).where(eq(repositories.organizationId, membership.organizationId));

  logger.info("github.installation.disconnected", { organizationId: membership.organizationId });
  return { disconnected: true as const };
}

/**
 * Returns the list of GitHub repositories synced to the user's workspace,
 * triggering a background sync before responding.
 */
export async function listGithubRepositoriesForUser(userId: string) {
  const membership =
    (await getMembershipForUser(userId)) ?? (await ensurePersonalWorkspace(userId));
  if (!membership) return [];

  if (membership.organization.githubInstallationId && isGithubAppConfigured()) {
    await syncInstallationRepositories(
      membership.organizationId,
      membership.organization.githubInstallationId,
    ).catch(() => undefined);
  } else if (isGithubAppConfigured()) {
    await syncGithubInstallationForUser(userId).catch(() => undefined);
  }

  const refreshed = await getMembershipForUser(userId);
  if (!refreshed) return [];

  return db.query.repositories.findMany({
    where: eq(repositories.organizationId, refreshed.organizationId),
    orderBy: (repo, { asc }) => [asc(repo.fullName)],
  });
}

// ── HMAC webhook verification ─────────────────────────────────────────────────

/**
 * Verifies the `X-Hub-Signature-256` header using timing-safe comparison.
 * Throws a `ServiceError` with UNAUTHORIZED if verification fails.
 */
export function verifyGithubWebhookSignature(
  payload: Buffer,
  signature: string | undefined,
): void {
  const secret = getGithubAppConfig().webhookSecret;
  if (!secret) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub webhook secret is not configured");
  }
  if (!signature?.startsWith("sha256=")) {
    throw new ServiceError("UNAUTHORIZED", "Missing or malformed GitHub webhook signature");
  }

  const expected = Buffer.from(
    `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`,
  );
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new ServiceError("UNAUTHORIZED", "GitHub webhook signature mismatch");
  }
}
