import type { Request, Response } from "express";

import { logger } from "@repo/logger";
import { ServiceError } from "@repo/services/errors";
import { verifyGithubWebhookSignature } from "@repo/services/github";
import { processGithubPullRequestWebhook } from "@repo/services/github";

export async function handleGithubWebhook(req: Request, res: Response) {
  try {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event") ?? "unknown";
    const deliveryId = req.header("x-github-delivery") ?? "unknown";
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

    verifyGithubWebhookSignature(payload, signature);

    const body = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
    logger.info("GitHub webhook received", { event, deliveryId, action: body.action });

    let result: Record<string, unknown> = { ok: true, event };
    if (event === "pull_request") {
      const prResult = await processGithubPullRequestWebhook(body as Parameters<typeof processGithubPullRequestWebhook>[0]);
      result = { ...result, ...prResult };
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.code === "UNAUTHORIZED" ? 401 : 503).json({ error: error.message });
    }

    logger.error("GitHub webhook failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
