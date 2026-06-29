CREATE TABLE IF NOT EXISTS "github_webhook_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "delivery_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "last_error" text,
  "next_retry_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_github_webhook_outbox_pending"
  ON "github_webhook_outbox" ("status", "next_retry_at");

CREATE INDEX IF NOT EXISTS "idx_github_webhook_outbox_delivery"
  ON "github_webhook_outbox" ("delivery_id", "event_type");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_github_webhook_outbox_delivery_event"
  ON "github_webhook_outbox" ("delivery_id", "event_type");
