-- Drop legacy tables that were carried over from a previous product iteration.
-- None of these are referenced in the current ShipFlow schema or application code.
-- Safe to drop: all models were removed in the ShipFlow pivot.

DROP TABLE IF EXISTS "corsair_permissions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "corsair_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "corsair_entities" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "corsair_accounts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "corsair_integrations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "thread_queue_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "thread_mail_cache" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "thread_contacts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "thread_gmail_state" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "thread_calendar_state" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "brief_dismissals" CASCADE;
