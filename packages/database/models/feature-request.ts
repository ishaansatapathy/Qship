import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { organizations } from "./organization";
import { projects } from "./project";

export const featureStatusEnum = pgEnum("feature_status", [
  "submitted",
  "clarifying",
  "duplicate_education",
  "rejected",
  "prd_generating",
  "prd_ready",
  "planning",
  "plan_approved",
  "in_development",
  "pr_open",
  "ai_review",
  "fix_needed",
  "human_review",
  "approved",
  "shipped",
]);

export const featureSourceEnum = pgEnum("feature_source", [
  "manual",
  "email",
  "support_ticket",
  "customer_call",
  "api",
]);

export const featureRequests = pgTable("feature_requests", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  rawRequest: text("raw_request").notNull(),
  source: featureSourceEnum("source").notNull().default("manual"),
  status: featureStatusEnum("status").notNull().default("submitted"),
  submitterEmail: text("submitter_email"),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const clarificationMessages = pgTable("clarification_messages", {
  id: text("id").primaryKey(),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequests.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | agent | system
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
