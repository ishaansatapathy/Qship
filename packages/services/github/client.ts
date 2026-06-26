import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import { getGithubAppConfig } from "./config";
import { ServiceError } from "../errors";

function requireGithubAppConfig() {
  const config = getGithubAppConfig();
  if (!config.appId || !config.privateKey) {
    throw new ServiceError("PRECONDITION_FAILED", "GitHub App is not configured");
  }
  return {
    appId: config.appId,
    privateKey: config.privateKey,
  };
}

export function getInstallationOctokit(installationId: string | number) {
  const { appId, privateKey } = requireGithubAppConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId: Number(installationId),
    },
  });
}

export function getAppOctokit() {
  const { appId, privateKey } = requireGithubAppConfig();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}
