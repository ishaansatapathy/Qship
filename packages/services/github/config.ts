function normalizePrivateKey(value: string | undefined) {
  if (!value) return undefined;
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function getGithubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID?.trim(),
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim(),
  };
}

export function getGithubAppConfig() {
  return {
    appId: process.env.GITHUB_APP_ID?.trim(),
    privateKey: normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY?.trim()),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    appSlug: process.env.GITHUB_APP_SLUG?.trim(),
  };
}

export function isGithubOAuthConfigured() {
  const { clientId, clientSecret } = getGithubOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export function isGithubAppConfigured() {
  const { appId, privateKey, appSlug } = getGithubAppConfig();
  return Boolean(appId && privateKey && appSlug);
}

export function isGithubWebhookConfigured() {
  return Boolean(getGithubAppConfig().webhookSecret);
}
