-- Legacy form-builder tables from earlier project iteration — unused in ShipFlow.
-- Drop them so the schema reflects the current product and no stale data lingers.
DROP TABLE IF EXISTS "submission_audit_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "submission_responses" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "submissions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "form_fields" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "form_versions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "forms" CASCADE;
