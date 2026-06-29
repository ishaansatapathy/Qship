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
    `<${buildFeatureRequestsUrl(input.featureId)}|Open in ShipFlow>`,
  ].filter(Boolean);

  return {
    text: `✅ Feature approved: ${input.featureTitle}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
    ],
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
    `<${buildFeatureRequestsUrl(input.featureId)}|Open in ShipFlow>`,
  ].filter(Boolean);

  return {
    text: `🚀 Feature shipped: ${input.featureTitle}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
    ],
  };
}

async function postSlackWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

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

async function persistSlackDelivery(
  featureId: string,
  event: "approved" | "shipped",
  result: SlackNotifyResult,
) {
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
}

/**
 * Notify Slack when a feature passes human approval (closes the demo Slack feature loop).
 * Uses SLACK_WEBHOOK_URL when set; otherwise records a simulated delivery on the timeline.
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

  let result: SlackNotifyResult = {
    sent: false,
    simulated: false,
    channel,
  };

  try {
    if (isSlackNotifyConfigured()) {
      await postSlackWebhook(payload);
      result = { sent: true, simulated: false, channel };
    } else {
      result = { sent: true, simulated: true, channel };
      logger.info("slack.notify.simulated", {
        featureId: input.featureId,
        event: "approved",
        channel,
      });
    }
  } catch (error) {
    result = {
      sent: false,
      simulated: false,
      channel,
      error: error instanceof Error ? error.message : String(error),
    };
    logger.error("slack.notify.failed", {
      featureId: input.featureId,
      event: "approved",
      message: result.error,
    });
  }

  await persistSlackDelivery(input.featureId, "approved", result);

  const detail = result.sent
    ? result.simulated
      ? `Simulated post to ${channel ?? "#product-shipping"} (set SLACK_WEBHOOK_URL for live delivery)`
      : `Delivered to Slack${channel ? ` (${channel})` : ""}`
    : `Delivery failed: ${result.error ?? "unknown error"}`;

  await appendFeatureActivity(input.featureId, {
    kind: "status",
    title: result.sent ? "Slack notification sent ✓" : "Slack notification failed",
    detail,
    actor: "system",
  });

  return result;
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

  let result: SlackNotifyResult = {
    sent: false,
    simulated: false,
    channel,
  };

  try {
    if (isSlackNotifyConfigured()) {
      await postSlackWebhook(payload);
      result = { sent: true, simulated: false, channel };
    } else {
      result = { sent: true, simulated: true, channel };
      logger.info("slack.notify.simulated", {
        featureId: input.featureId,
        event: "shipped",
        channel,
      });
    }
  } catch (error) {
    result = {
      sent: false,
      simulated: false,
      channel,
      error: error instanceof Error ? error.message : String(error),
    };
    logger.error("slack.notify.failed", {
      featureId: input.featureId,
      event: "shipped",
      message: result.error,
    });
  }

  await persistSlackDelivery(input.featureId, "shipped", result);

  await appendFeatureActivity(input.featureId, {
    kind: "status",
    title: result.sent ? "Slack shipped alert sent 🚀" : "Slack shipped alert failed",
    detail: result.sent
      ? result.simulated
        ? `Simulated shipped alert${channel ? ` to ${channel}` : ""}`
        : `Shipped alert delivered${channel ? ` to ${channel}` : ""}`
      : result.error,
    actor: "system",
  });

  return result;
}
