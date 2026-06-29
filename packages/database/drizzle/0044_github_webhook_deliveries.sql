CREATE TABLE IF NOT EXISTS "github_webhook_deliveries" (
  "delivery_id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_github_webhook_deliveries_processed_at"
  ON "github_webhook_deliveries" ("processed_at");
