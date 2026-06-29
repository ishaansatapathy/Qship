import db from "@repo/database";
import { githubWebhookDeliveries } from "@repo/database/schema";
import { lt, sql } from "@repo/database";
import { logger } from "@repo/logger";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Atomically records a GitHub delivery ID. Returns true if this delivery was already processed.
 */
export async function isGithubDeliveryDuplicate(
  deliveryId: string,
  eventType: string,
): Promise<boolean> {
  if (!deliveryId || deliveryId === "unknown") {
    return false;
  }

  const cutoff = new Date(Date.now() - RETENTION_MS);
  await db
    .delete(githubWebhookDeliveries)
    .where(lt(githubWebhookDeliveries.processedAt, cutoff))
    .catch(() => undefined);

  const inserted = await db
    .insert(githubWebhookDeliveries)
    .values({
      deliveryId,
      eventType,
    })
    .onConflictDoNothing({ target: githubWebhookDeliveries.deliveryId })
    .returning({ deliveryId: githubWebhookDeliveries.deliveryId });

  if (inserted.length === 0) {
    logger.info("webhook.delivery.duplicate_skipped", { deliveryId, eventType });
    return true;
  }

  return false;
}

/** Test helper — clears dedup table. */
export async function clearGithubWebhookDeliveriesForTests(): Promise<void> {
  if (process.env.NODE_ENV !== "test") return;
  await db.delete(githubWebhookDeliveries).where(sql`true`);
}
