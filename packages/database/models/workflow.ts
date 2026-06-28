import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";

export const workflowTypeEnum = pgEnum("workflow_type", [
  "prd_generation",
  "task_generation",
  "repo_analysis",
  "pr_processing",
  "ai_review",
  "re_review",
  "release_readiness",
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

/**
 * A single execution of an async Inngest workflow tied to a feature request.
 * Progress is tracked as an integer percentage [0, 100].
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    featureRequestId: text("feature_request_id").references(() => featureRequests.id, {
      onDelete: "cascade",
    }),
    inngestEventId: text("inngest_event_id"),
    type: workflowTypeEnum("type").notNull(),
    status: workflowStatusEnum("status").notNull().default("pending"),
    /** Completion percentage in the range [0, 100]. */
    progress: integer("progress").notNull().default(0),
    message: text("message"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /** Primary query for finding active runs per feature. */
    index("idx_workflow_runs_feature_status").on(t.featureRequestId, t.status),
    /** Inngest event correlation lookup. */
    index("idx_workflow_runs_inngest_event").on(t.inngestEventId),
  ],
);
