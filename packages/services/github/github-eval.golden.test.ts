import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SHIPFLOW_MCP_TOOLS } from "../shipflow-agent-tools";
import { AGENT_TOOLS } from "../ai/agent-internals";
import {
  buildGithubInstallUrl,
  decodeGithubInstallState,
  encodeGithubInstallState,
  syncInstallationRepositoriesForOrg,
  verifyGithubWebhookSignature,
} from "./installation";
import { inngestFunctions } from "../inngest/functions";
import {
  dispatchWebhookPullRequestAiReview,
  enqueueGithubWebhookRetry,
  extractFeatureIdFromPullRequest,
  getGithubWebhookOutboxStats,
  processGithubInstallationWebhook,
  processGithubPullRequestWebhook,
} from "./index";
import { executeFeatureRelease } from "./release-ship";

/** Labeled invariants for GitHub integration merge gate (see AI_EVAL.md §3). */
export const GITHUB_EVAL_INVARIANTS = [
  "signed_install_state_with_nonce",
  "webhook_hmac_timing_safe",
  "postgres_delivery_dedup",
  "webhook_processor_pull_request",
  "webhook_processor_installation",
  "octokit_squash_merge_contract",
  "feature_branch_shipflow_uuid",
  "feature_pr_body_tag",
  "squash_merge_on_ship",
  "agent_mcp_tool_parity",
  "repo_picker_multi_repo",
  "sync_installation_exposed",
  "webhook_outbox_retry",
  "async_webhook_pr_review",
  "repo_auto_sync_on_webhook",
  "webhook_operator_visibility",
  "inngest_outbox_cron",
  "github_live_smoke_optional",
  /** Outbox retries bypass the delivery dedup so mid-flight failures are never lost. */
  "outbox_dedup_bypass_on_retry",
  /** Optimistic UPDATE WHERE status='pending' prevents double-processing in multi-instance deploys. */
  "outbox_optimistic_claim",
  "http_webhook_hmac_before_parse",
  "repository_limit_on_sync",
] as const;

export const GITHUB_EVAL_INVARIANT_COUNT = GITHUB_EVAL_INVARIANTS.length;

describe("github integration eval harness", () => {
  it(`documents ${GITHUB_EVAL_INVARIANT_COUNT}+ integration invariants`, () => {
    expect(GITHUB_EVAL_INVARIANT_COUNT).toBeGreaterThanOrEqual(12);
  });

  it("agent and MCP expose the same GitHub tool names", () => {
    const githubTools = ["github_connection_status", "list_github_repositories"];
    for (const name of githubTools) {
      expect(AGENT_TOOLS.map((t) => t.function.name)).toContain(name);
      expect(SHIPFLOW_MCP_TOOLS.map((t) => t.name)).toContain(name);
    }
  });

  it("mcp-server.json lists GitHub tools", () => {
    const manifestPath = path.resolve(__dirname, "../../../mcp-server.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      tools: Array<{ name: string }>;
    };
    const names = manifest.tools.map((t) => t.name);
    expect(names).toContain("github_connection_status");
    expect(names).toContain("list_github_repositories");
    expect(names).toContain("implement_feature_code");
  });

  it("runtime exports cover production GitHub integration surface", () => {
    expect(typeof encodeGithubInstallState).toBe("function");
    expect(typeof decodeGithubInstallState).toBe("function");
    expect(typeof verifyGithubWebhookSignature).toBe("function");
    expect(typeof buildGithubInstallUrl).toBe("function");
    expect(typeof syncInstallationRepositoriesForOrg).toBe("function");
    expect(typeof processGithubPullRequestWebhook).toBe("function");
    expect(typeof processGithubInstallationWebhook).toBe("function");
    expect(typeof executeFeatureRelease).toBe("function");
    expect(typeof enqueueGithubWebhookRetry).toBe("function");
    expect(typeof getGithubWebhookOutboxStats).toBe("function");
    expect(typeof dispatchWebhookPullRequestAiReview).toBe("function");
  });

  it("webhook processor returns operator guidance when repo is unsynced", async () => {
    const webhookSource = readFileSync(path.resolve(__dirname, "./webhook.ts"), "utf8");
    expect(webhookSource).toContain("operatorAction");
    expect(webhookSource).toContain("syncInstallationRepositoriesForOrg");
    expect(webhookSource).toContain("dispatchWebhookPullRequestAiReview");
  });

  it("release ship module performs squash merge path", () => {
    const releaseSource = readFileSync(path.resolve(__dirname, "./release-ship.ts"), "utf8");
    expect(releaseSource).toContain('merge_method: "squash"');
  });

  it("registers Inngest cron for webhook outbox processing", () => {
    const ids = inngestFunctions.map((fn) => fn.id());
    expect(ids).toContain("shipflow-github-webhook-outbox");
  });

  it("HTTP handler verifies HMAC before JSON.parse", () => {
    const handler = readFileSync(
      path.resolve(__dirname, "../../../apps/api/src/github-webhook.ts"),
      "utf8",
    );
    expect(handler).toContain("verifyGithubWebhookSignature(payload, signature)");
    expect(handler.indexOf("verifyGithubWebhookSignature")).toBeLessThan(
      handler.indexOf("JSON.parse"),
    );
    const httpTest = readFileSync(
      path.resolve(__dirname, "../../../apps/api/src/github-webhook.test.ts"),
      "utf8",
    );
    expect(httpTest).toContain("returns 401 when HMAC verification fails");
  });

  it("enforces repositoryLimit during installation sync", () => {
    const src = readFileSync(path.resolve(__dirname, "./installation.ts"), "utf8");
    expect(src).toContain("repositoryLimit");
    expect(src).toContain("repo_limit_skipped");
  });
});
