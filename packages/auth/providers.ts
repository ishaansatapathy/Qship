import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

function loadRootEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      config({ path: envPath, override: true });
      return;
    }
    dir = path.dirname(dir);
  }
}

loadRootEnv();

export type AuthProviderKind = "EMAIL" | "GOOGLE_OAUTH" | "GITHUB_OAUTH";

export type EnabledAuthProvider = {
  provider: AuthProviderKind;
  enabled: boolean;
};

export function getGoogleOAuthCredentials() {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return { clientId, clientSecret };
}

export function getGithubOAuthCredentials() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured() {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  return Boolean(clientId && clientSecret);
}

export function isGithubOAuthConfigured() {
  const { clientId, clientSecret } = getGithubOAuthCredentials();
  return Boolean(clientId && clientSecret);
}

export function getEnabledAuthProviders(): EnabledAuthProvider[] {
  const providers: EnabledAuthProvider[] = [{ provider: "EMAIL", enabled: true }];

  if (isGoogleOAuthConfigured()) {
    providers.push({ provider: "GOOGLE_OAUTH", enabled: true });
  }

  if (isGithubOAuthConfigured()) {
    providers.push({ provider: "GITHUB_OAUTH", enabled: true });
  }

  return providers;
}

export function getBetterAuthSocialProviders() {
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

  const google = getGoogleOAuthCredentials();
  if (google.clientId && google.clientSecret) {
    socialProviders.google = {
      clientId: google.clientId,
      clientSecret: google.clientSecret,
    };
  }

  const github = getGithubOAuthCredentials();
  if (github.clientId && github.clientSecret) {
    socialProviders.github = {
      clientId: github.clientId,
      clientSecret: github.clientSecret,
    };
  }

  return socialProviders;
}
