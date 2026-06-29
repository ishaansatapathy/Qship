import { and, asc, eq, lte, sql } from "@repo/database";
import db from "@repo/database";
import { githubWebhookOutbox } from "@repo/database/schema";
import { logger } from "@repo/logger";

import {
  processGithubInstallationWebhook,
  processGithubPullRequestWebhook,
} from "./webhook";
import { computeNextRetryAt } from "./webhook-outbox-utils";

export async function enqueueGithubWebhookRetry(input: {
  deliveryId: string;
  eventType: string;
  payload: Record<string, unknown>;
  error: string;
}) {
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(githubWebhookOutbox)
    .values({
      id,
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      lastError: input.error.slice(0, 2000),
      nextRetryAt: computeNextRetryAt(1),
    })
    .onConflictDoNothing({ target: [githubWebhookOutbox.deliveryId, githubWebhookOutbox.eventType] })
    .returning({ id: githubWebhookOutbox.id });

  if (inserted.length === 0) return;

  logger.warn("webhook.outbox.enqueued", {
    deliveryId: input.deliveryId,
    eventType: input.eventType,
    error: input.error,
  });
}

async function dispatchOutboxRow(row: typeof githubWebhookOutbox.$inferSelect) {
  if (row.eventType === "pull_request") {
    return processGithubPullRequestWebhook(
      row.payload as Parameters<typeof processGithubPullRequestWebhook>[0],
      row.deliveryId,
    );
  }
  if (row.eventType === "installation" || row.eventType === "installation_repositories") {
    return processGithubInstallationWebhook(
      row.payload as Parameters<typeof processGithubInstallationWebhook>[0],
      row.deliveryId,
    );
  }
  return { handled: false, reason: "unsupported_event" as const };
}

export async function processGithubWebhookOutbox(limit = 10): Promise<number> {
  const rows = await db
    .select()
    .from(githubWebhookOutbox)
    .where(
      and(
        eq(githubWebhookOutbox.status, "pending"),
        lte(githubWebhookOutbox.nextRetryAt, new Date()),
      ),
    )
    .orderBy(asc(githubWebhookOutbox.nextRetryAt))
    .limit(limit);

  let processed = 0;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    await db
      .update(githubWebhookOutbox)
      .set({ status: "processing", attempts, updatedAt: new Date() })
      .where(eq(githubWebhookOutbox.id, row.id));

    try {
      await dispatchOutboxRow(row);
      await db
        .update(githubWebhookOutbox)
        .set({ status: "completed", updatedAt: new Date(), lastError: null })
        .where(eq(githubWebhookOutbox.id, row.id));
      processed += 1;
      logger.info("webhook.outbox.completed", {
        id: row.id,
        deliveryId: row.deliveryId,
        eventType: row.eventType,
        attempts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = attempts >= row.maxAttempts;
      await db
        .update(githubWebhookOutbox)
        .set({
          status: failed ? "failed" : "pending",
          lastError: message.slice(0, 2000),
          nextRetryAt: failed ? row.nextRetryAt : computeNextRetryAt(attempts),
          updatedAt: new Date(),
        })
        .where(eq(githubWebhookOutbox.id, row.id));

      logger.warn("webhook.outbox.retry_scheduled", {
        id: row.id,
        deliveryId: row.deliveryId,
        attempts,
        failed,
        error: message,
      });
    }
  }

  return processed;
}

export async function getGithubWebhookOutboxStats() {
  const rows = await db
    .select({
      status: githubWebhookOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(githubWebhookOutbox)
    .groupBy(githubWebhookOutbox.status);

  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}
