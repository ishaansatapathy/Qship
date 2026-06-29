import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const githubWebhookOutbox = pgTable(
  "github_webhook_outbox",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_github_webhook_outbox_pending").on(t.status, t.nextRetryAt),
    index("idx_github_webhook_outbox_delivery").on(t.deliveryId, t.eventType),
  ],
);

export type GithubWebhookOutboxRow = typeof githubWebhookOutbox.$inferSelect;
