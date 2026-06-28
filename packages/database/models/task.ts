import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]);

/** An engineering sub-task derived from a PRD during the planning phase. */
export const engineeringTasks = pgTable(
  "engineering_tasks",
  {
    id: text("id").primaryKey(),
    featureRequestId: text("feature_request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: taskStatusEnum("status").notNull().default("backlog"),
    /** Zero-based position for drag-and-drop Kanban ordering. */
    sortOrder: integer("sort_order").notNull().default(0),
    assigneeUserId: text("assignee_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /** Kanban board query: all tasks for a feature, ordered by position. */
    index("idx_engineering_tasks_feature_sort").on(t.featureRequestId, t.sortOrder),
    /** Status filter within a feature. */
    index("idx_engineering_tasks_feature_status").on(t.featureRequestId, t.status),
  ],
);
