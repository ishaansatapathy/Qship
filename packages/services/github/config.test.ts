import { afterEach, describe, expect, it } from "vitest";

import { isGithubAppConfigured, isGithubWebhookConfigured } from "./config";

describe("isGithubAppConfigured", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("requires webhook secret in production for connect-ready status", () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_SLUG = "qship-shipflow";
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;

    expect(isGithubWebhookConfigured()).toBe(false);
    expect(isGithubAppConfigured()).toBe(false);
  });

  it("reads GITHUB_APP_WEBHOOK_SECRET as legacy alias", () => {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_SLUG = "qship-shipflow";
    delete process.env.GITHUB_WEBHOOK_SECRET;
    process.env.GITHUB_APP_WEBHOOK_SECRET = "legacy-alias-secret";

    expect(isGithubAppConfigured()).toBe(true);
  });

  it("allows app credentials without webhook secret in development", () => {
    process.env.NODE_ENV = "development";
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_SLUG = "qship-shipflow";
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;

    expect(isGithubAppConfigured()).toBe(true);
  });
});
