import crypto from "node:crypto";
import type { Request, Response } from "express";

import { logger } from "@repo/logger";
import { ServiceError } from "@repo/services/errors";
import { isProductionEnv } from "@repo/services/runtime-env";
import {
  isGithubWebhookConfigured,
  verifyGithubWebhookSignature,
  enqueueGithubWebhookRetry,
} from "@repo/services/github";
import {
  processGithubInstallationWebhook,
  processGithubPullRequestWebhook,
} from "@repo/services/github";
import { processGithubIssueWebhook } from "@repo/services/github/issue-intake";

/**
 * Express handler for `POST /webhooks/github`.
 *
 * Security: The raw request body is verified against the HMAC-SHA256
 * `X-Hub-Signature-256` header before any payload parsing occurs.
 * This handler must be mounted **before** `express.json()` so the raw Buffer
 * is available for signature computation.
 *
 * Event routing:
 * - `pull_request`              → link PRs to features, trigger AI review
 * - `installation`              → sync / disconnect GitHub App installations
 * - `installation_repositories` → remove unlinked repositories
 * - all others                  → acknowledged (200) but not processed
 */
export async function handleGithubWebhook(req: Request, res: Response) {
  const signature = req.header("x-hub-signature-256");
  const event = req.header("x-github-event") ?? "unknown";
  const deliveryHeader = req.header("x-github-delivery");
  if (!deliveryHeader && isProductionEnv()) {
    logger.warn("webhook.github.missing_delivery_id", { event: req.header("x-github-event") });
    return res.status(400).json({ error: "Missing X-GitHub-Delivery header" });
  }
  const deliveryId = deliveryHeader ?? crypto.randomUUID();

  if (!isGithubWebhookConfigured()) {
    logger.error("webhook.github.secret_not_configured", { event });
    return res.status(503).json({ error: "Webhook secret not configured" });
  }

  // ── Signature verification ────────────────────────────────────────────────────
  const payload = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}));

  try {
    verifyGithubWebhookSignature(payload, signature);
  } catch (error) {
    if (error instanceof ServiceError && error.code === "UNAUTHORIZED") {
      logger.warn("webhook.github.signature_invalid", { deliveryId, event });
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    if (error instanceof ServiceError && error.code === "PRECONDITION_FAILED") {
      logger.error("webhook.github.secret_not_configured", { event });
      return res.status(503).json({ error: "Webhook secret not configured" });
    }
    throw error;
  }

  // ── Parse payload ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
  } catch {
    logger.warn("webhook.github.invalid_json", { deliveryId, event });
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  logger.info("webhook.github.received", {
    event,
    deliveryId,
    action: typeof body.action === "string" ? body.action : undefined,
  });

  // ── Event routing ─────────────────────────────────────────────────────────────
  try {
    let result: Record<string, unknown> = { ok: true, event, deliveryId };

    if (event === "pull_request") {
      const prResult = await processGithubPullRequestWebhook(
        body as Parameters<typeof processGithubPullRequestWebhook>[0],
        deliveryId,
      );
      result = { ...result, ...prResult };
    } else if (event === "issues") {
      const issueResult = await processGithubIssueWebhook(
        body as Parameters<typeof processGithubIssueWebhook>[0],
      );
      result = { ...result, ...issueResult };
    } else if (event === "installation" || event === "installation_repositories") {
      const installResult = await processGithubInstallationWebhook(
        body as Parameters<typeof processGithubInstallationWebhook>[0],
        deliveryId,
      );
      result = { ...result, ...installResult };
    } else {
      result = { ...result, handled: false, reason: "unsupported_event" };
    }

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("webhook.github.handler_error", {
      event,
      deliveryId,
      error: message,
    });

    if (event === "pull_request" || event === "issues" || event === "installation" || event === "installation_repositories") {
      await enqueueGithubWebhookRetry({
        deliveryId,
        eventType: event,
        payload: body,
        error: message,
      }).catch((enqueueError) => {
        logger.error("webhook.outbox.enqueue_failed", {
          deliveryId,
          error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
        });
      });
    }

    return res.status(500).json({ error: "Internal webhook processing error" });
  }
}
