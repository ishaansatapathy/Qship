import crypto from "node:crypto";

import { and, db, eq } from "@repo/database";
import { organizations, repositories } from "@repo/database/schema";

import { ServiceError } from "../errors";
import { ensurePersonalWorkspace, getMembershipForUser } from "../organization";
import { getAppOctokit, getInstallationOctokit } from "./client";
import { getGithubAppConfig, isGithubAppConfigured } from "./config";

export type GithubInstallState = {
  organizationId: string;
  returnTo?: string;
};

export function encodeGithubInstallState(state: GithubInstallState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeGithubInstallState(raw: string | null | undefined): GithubInstallState | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as GithubInstallState;
    if (!parsed.organizationId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGithubInstallUrl(params: { organizationId: string; returnTo?: string }) {
  const { appSlug } = getGithubAppConfig();
  if (!isGithubAppConfigured() || !appSlug) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub App is not configured");
  }

  const state = encodeGithubInstallState(params);
  return `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

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

  if (org.githubInstallationId && isGithubAppConfigured()) {
    await syncInstallationRepositories(org.id, org.githubInstallationId).catch(() => undefined);
  } else if (isGithubAppConfigured()) {
    await syncGithubInstallationForUser(userId).catch(() => undefined);
  }

  const refreshed = await getMembershipForUser(userId);
  const updatedOrg = refreshed?.organization ?? org;
  const connected = Boolean(updatedOrg.githubInstallationId);
  const orgRepos = await db.query.repositories.findMany({
    where: eq(repositories.organizationId, updatedOrg.id),
  });

  return {
    connected,
    configured: isGithubAppConfigured(),
    accountLogin: updatedOrg.githubAccountLogin ?? null,
    installationId: updatedOrg.githubInstallationId ?? null,
    repositoryCount: orgRepos.length,
  };
}

async function linkGithubInstallationToOrganization(organizationId: string, installationId: string) {
  const octokit = getInstallationOctokit(installationId);
  const { data: installation } = await octokit.rest.apps.getInstallation({
    installation_id: Number(installationId),
  });

  const accountLogin =
    installation.account && "login" in installation.account ? installation.account.login : null;

  await db
    .update(organizations)
    .set({
      githubInstallationId: installationId,
      githubAccountLogin: accountLogin,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  await syncInstallationRepositories(organizationId, installationId);

  return { installationId, accountLogin };
}

/**
 * Links an existing GitHub App installation to the user's workspace.
 * Used when the app was installed from GitHub settings without ShipFlow callback.
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

  const app = getAppOctokit();
  const installations = await app.paginate(app.rest.apps.listInstallations, { per_page: 100 });

  if (installations.length === 0) {
    return { synced: false as const, connected: false as const, reason: "no_installations" as const };
  }

  const pick =
    installations.length === 1
      ? installations[0]
      : installations.find(
          (row) => row.account && "type" in row.account && row.account.type === "User",
        ) ?? installations[0];

  if (!pick?.id) {
    return { synced: false as const, connected: false as const, reason: "no_installations" as const };
  }

  const linked = await linkGithubInstallationToOrganization(org.id, String(pick.id));
  return {
    synced: true as const,
    connected: true as const,
    installationId: linked.installationId,
    accountLogin: linked.accountLogin,
  };
}

async function syncInstallationRepositories(organizationId: string, installationId: string) {
  const octokit = getInstallationOctokit(installationId);
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({ per_page: 100 });

  for (const repo of data.repositories) {
    const repoId = String(repo.id);
    const rowId = `${organizationId}-repo-${repoId}`;
    const existing = await db.query.repositories.findFirst({
      where: and(
        eq(repositories.organizationId, organizationId),
        eq(repositories.githubRepoId, repoId),
      ),
    });

    const payload = {
      organizationId,
      githubInstallationId: installationId,
      githubRepoId: repoId,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? "main",
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(repositories).set(payload).where(eq(repositories.id, existing.id));
      continue;
    }

    await db.insert(repositories).values({
      id: rowId,
      ...payload,
    });
  }
}

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
  const organizationId = decodedState?.organizationId ?? membership.organizationId;
  if (organizationId !== membership.organizationId) {
    throw new ServiceError("FORBIDDEN", "You can only connect GitHub to your workspace");
  }

  const octokit = getInstallationOctokit(params.installationId);
  const { data: installation } = await octokit.rest.apps.getInstallation({
    installation_id: Number(params.installationId),
  });

  const accountLogin =
    installation.account && "login" in installation.account ? installation.account.login : null;

  await linkGithubInstallationToOrganization(organizationId, params.installationId);

  return {
    organizationId,
    installationId: params.installationId,
    accountLogin,
    returnTo: decodedState?.returnTo ?? "/settings",
  };
}

export async function disconnectGithubForUser(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("FORBIDDEN", "No workspace found");
  }

  await db
    .update(organizations)
    .set({
      githubInstallationId: null,
      githubAccountLogin: null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, membership.organizationId));

  await db.delete(repositories).where(eq(repositories.organizationId, membership.organizationId));

  return { disconnected: true as const };
}

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

export function verifyGithubWebhookSignature(payload: Buffer, signature: string | undefined) {
  const secret = getGithubAppConfig().webhookSecret;
  if (!secret) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub webhook secret is not configured");
  }
  if (!signature?.startsWith("sha256=")) {
    throw new ServiceError("UNAUTHORIZED", "Missing GitHub webhook signature");
  }

  const digest = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new ServiceError("UNAUTHORIZED", "Invalid GitHub webhook signature");
  }
}
