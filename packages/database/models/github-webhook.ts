import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Processed GitHub webhook delivery IDs for cross-instance idempotency. */
export const githubWebhookDeliveries = pgTable(
  "github_webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at").notNull().defaultNow(),
  },
  (t) => [index("idx_github_webhook_deliveries_processed_at").on(t.processedAt)],
);
