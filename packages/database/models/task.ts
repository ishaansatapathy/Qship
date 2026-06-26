import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]);

export const engineeringTasks = pgTable("engineering_tasks", {
  id: text("id").primaryKey(),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequests.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: taskStatusEnum("status").notNull().default("backlog"),
  sortOrder: integer("sort_order").notNull().default(0),
  assigneeUserId: text("assignee_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
