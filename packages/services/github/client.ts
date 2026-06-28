import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { logger } from "@repo/logger";

import { getGithubAppConfig } from "./config";
import { ServiceError } from "../errors";

function requireGithubAppConfig() {
  const config = getGithubAppConfig();
  if (!config.appId || !config.privateKey) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub App is not configured");
  }
  return { appId: config.appId, privateKey: config.privateKey };
}

// ── Installation token cache ──────────────────────────────────────────────────
//
// GitHub App installation tokens are valid for exactly 1 hour. Caching the
// Octokit instance avoids a round-trip JWT exchange on every request.
// We evict 5 minutes early to ensure no request races against expiry.

const CACHE_TTL_MS = 55 * 60 * 1000; // 55 minutes

type CachedClient = {
  octokit: Octokit;
  expiresAt: number;
};

const installationCache = new Map<string, CachedClient>();

function evictExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of installationCache) {
    if (entry.expiresAt <= now) {
      installationCache.delete(key);
    }
  }
}

/**
 * Returns a cached Octokit instance authenticated as the given installation.
 * A new instance is created only when the cached token is within 5 minutes of
 * expiry (or has never been created for this installation ID).
 */
export function getInstallationOctokit(installationId: string | number): Octokit {
  evictExpiredEntries();

  const id = String(installationId);
  const cached = installationCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.octokit;
  }

  const { appId, privateKey } = requireGithubAppConfig();
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: Number(id) },
    log: {
      debug: (msg) => logger.debug(`[octokit] ${msg}`),
      info: (msg) => logger.info(`[octokit] ${msg}`),
      warn: (msg) => logger.warn(`[octokit] ${msg}`),
      error: (msg) => logger.error(`[octokit] ${msg}`),
    },
  });

  installationCache.set(id, { octokit, expiresAt: Date.now() + CACHE_TTL_MS });
  logger.debug("octokit.installation_client_created", { installationId: id });
  return octokit;
}

/**
 * Invalidates the cached Octokit for an installation, e.g. after receiving an
 * `installation.deleted` webhook so the next call gets a fresh client (or
 * throws if the app has been uninstalled).
 */
export function invalidateInstallationCache(installationId: string | number) {
  installationCache.delete(String(installationId));
}

/**
 * Returns an Octokit instance authenticated as the GitHub App itself (not an
 * installation). Use this for listing installations and app-level metadata.
 */
export function getAppOctokit(): Octokit {
  const { appId, privateKey } = requireGithubAppConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
    log: {
      debug: (msg) => logger.debug(`[octokit-app] ${msg}`),
      info: (msg) => logger.info(`[octokit-app] ${msg}`),
      warn: (msg) => logger.warn(`[octokit-app] ${msg}`),
      error: (msg) => logger.error(`[octokit-app] ${msg}`),
    },
  });
}
