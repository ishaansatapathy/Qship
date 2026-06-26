import { integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { featureRequests } from "./feature-request";
import { pullRequests } from "./github";

export const reviewSeverityEnum = pgEnum("review_severity", ["blocking", "non_blocking"]);

export const aiReviews = pgTable("ai_reviews", {
  id: text("id").primaryKey(),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequests.id, { onDelete: "cascade" }),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  iteration: integer("iteration").notNull().default(1),
  summary: text("summary").notNull(),
  readyForHuman: text("ready_for_human").notNull().default("false"),
  rawAnalysis: jsonb("raw_analysis").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiReviewIssues = pgTable("ai_review_issues", {
  id: text("id").primaryKey(),
  aiReviewId: text("ai_review_id")
    .notNull()
    .references(() => aiReviews.id, { onDelete: "cascade" }),
  severity: reviewSeverityEnum("severity").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  filePath: text("file_path"),
  lineNumber: text("line_number"),
  requirementRef: text("requirement_ref"),
  resolved: text("resolved").notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const humanApprovals = pgTable("human_approvals", {
  id: text("id").primaryKey(),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequests.id, { onDelete: "cascade" }),
  reviewerUserId: text("reviewer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
