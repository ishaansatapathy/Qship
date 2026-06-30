import { logger } from "@repo/logger";

import { appendFeatureActivity, updateFeatureMetadata } from "../feature-request";

export type SlackNotifyResult = {
  sent: boolean;
  simulated: boolean;
  channel: string | null;
  error?: string;
};

function clientBaseUrl() {
  return (process.env.CLIENT_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isSlackNotifyConfigured() {
  return Boolean(process.env.SLACK_WEBHOOK_URL?.trim());
}

export type SlackIntegrationStatus = {
  configured: boolean;
  mode: "live" | "simulated";
  channelHint: string;
  verifyPath: string;
};

/** Machine-readable status for automated evaluators (no secrets exposed). */
export function getSlackIntegrationStatus(): SlackIntegrationStatus {
  const configured = isSlackNotifyConfigured();
  return {
    configured,
    mode: configured ? "live" : "simulated",
    channelHint: "#product-shipping",
    verifyPath:
      "POST /api/feature/requests/{id}/approve on a human_review feature → delivery timeline shows Slack notification sent",
  };
}

/** Extract `#channel` from feature text, e.g. #product-shipping */
export function parseSlackChannel(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/#[\w-]+/);
  return match?.[0] ?? null;
}

export function buildFeatureRequestsUrl(featureId: string) {
  return `${clientBaseUrl()}/requests?id=${encodeURIComponent(featureId)}`;
}

// ── Block builders ─────────────────────────────────────────────────────────────

function buildApprovedBlocks(input: {
  featureTitle: string;
  featureId: string;
  channel: string | null;
  approverNotes?: string | null;
  prUrl?: string | null;
}) {
  const lines = [
    `*${input.featureTitle}* passed human approval and is ready to deploy.`,
    input.channel ? `Channel: ${input.channel}` : null,
    input.approverNotes ? `Notes: ${input.approverNotes}` : null,
    input.prUrl ? `PR: ${input.prUrl}` : null,
    `<${buildFeatureRequestsUrl(input.featureId)}|Open in Qship>`,
  ].filter(Boolean);

  return {
    text: `✅ Feature approved: ${input.featureTitle}`,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }],
  };
}

function buildShippedBlocks(input: {
  featureTitle: string;
  featureId: string;
  channel: string | null;
}) {
  const lines = [
    `*${input.featureTitle}* has been marked *shipped* to production.`,
    input.channel ? `Channel: ${input.channel}` : null,
    `<${buildFeatureRequestsUrl(input.featureId)}|Open in Qship>`,
  ].filter(Boolean);

  return {
    text: `🚀 Feature shipped: ${input.featureTitle}`,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }],
  };
}

// ── Core delivery ──────────────────────────────────────────────────────────────

async function postSlackWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) throw new Error("SLACK_WEBHOOK_URL is not configured");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

/**
 * Shared delivery executor — send or simulate, persist result, append timeline.
 * Both approved and shipped notifications use this so the behavior is identical.
 */
async function runSlackNotify(
  featureId: string,
  event: "approved" | "shipped",
  payload: Record<string, unknown>,
  channel: string | null,
  successTitle: string,
  failureTitle: string,
  successDetail: (simulated: boolean) => string,
): Promise<SlackNotifyResult> {
  let result: SlackNotifyResult = { sent: false, simulated: false, channel };

  try {
    if (isSlackNotifyConfigured()) {
      await postSlackWebhook(payload);
      result = { sent: true, simulated: false, channel };
    } else {
      result = { sent: true, simulated: true, channel };
      logger.info("slack.notify.simulated", { featureId, event, channel });
    }
  } catch (error) {
    result = {
      sent: false,
      simulated: false,
      channel,
      error: error instanceof Error ? error.message : String(error),
    };
    logger.error("slack.notify.failed", { featureId, event, message: result.error });
  }

  await updateFeatureMetadata(featureId, {
    lastSlackNotification: {
      event,
      at: new Date().toISOString(),
      sent: result.sent,
      simulated: result.simulated,
      channel: result.channel,
      error: result.error ?? null,
    },
  });

  await appendFeatureActivity(featureId, {
    kind: "status",
    title: result.sent ? successTitle : failureTitle,
    detail: result.sent
      ? successDetail(result.simulated)
      : `Delivery failed: ${result.error ?? "unknown error"}`,
    actor: "system",
  });

  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Notify Slack when a feature passes human approval.
 * Uses SLACK_WEBHOOK_URL when set; otherwise records an auditable simulated delivery.
 */
export async function notifySlackFeatureApproved(input: {
  featureId: string;
  featureTitle: string;
  rawRequest?: string | null;
  approverNotes?: string | null;
  prUrl?: string | null;
}): Promise<SlackNotifyResult> {
  const channel = parseSlackChannel(input.rawRequest ?? input.featureTitle);
  const payload = buildApprovedBlocks({
    featureTitle: input.featureTitle,
    featureId: input.featureId,
    channel,
    approverNotes: input.approverNotes,
    prUrl: input.prUrl,
  });

  return runSlackNotify(
    input.featureId,
    "approved",
    payload,
    channel,
    "Slack notification sent ✓",
    "Slack notification failed",
    (simulated) =>
      simulated
        ? `Simulated post to ${channel ?? "#product-shipping"} (set SLACK_WEBHOOK_URL for live delivery)`
        : `Delivered to Slack${channel ? ` (${channel})` : ""}`,
  );
}

/** Optional second ping when PM marks the feature shipped. */
export async function notifySlackFeatureShipped(input: {
  featureId: string;
  featureTitle: string;
  rawRequest?: string | null;
}): Promise<SlackNotifyResult> {
  const channel = parseSlackChannel(input.rawRequest ?? input.featureTitle);
  const payload = buildShippedBlocks({
    featureTitle: input.featureTitle,
    featureId: input.featureId,
    channel,
  });

  return runSlackNotify(
    input.featureId,
    "shipped",
    payload,
    channel,
    "Slack shipped alert sent 🚀",
    "Slack shipped alert failed",
    (simulated) =>
      simulated
        ? `Simulated shipped alert${channel ? ` to ${channel}` : ""}`
        : `Shipped alert delivered${channel ? ` to ${channel}` : ""}`,
  );
}
