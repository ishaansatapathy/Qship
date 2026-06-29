import { logger } from "@repo/logger";

import { isInngestCloudConfigured } from "../inngest/client";
import { processGithubWebhookOutbox } from "./webhook-outbox";

/** Starts outbox draining — Inngest cron when cloud is configured, else interval fallback. */
export function startGithubWebhookOutboxProcessor(): () => void {
  if (isInngestCloudConfigured()) {
    logger.info("github.webhook_outbox.processor", { mode: "inngest_cron" });
    return () => undefined;
  }

  logger.info("github.webhook_outbox.processor", { mode: "interval_fallback" });
  const interval = setInterval(() => {
    void processGithubWebhookOutbox(20).catch((error) => {
      logger.warn("webhook.outbox.processor_error", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, 60_000);
  interval.unref();

  return () => clearInterval(interval);
}
