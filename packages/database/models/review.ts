import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { featureRequests } from "./feature-request";
import { pullRequests } from "./github";

export const reviewSeverityEnum = pgEnum("review_severity", ["blocking", "non_blocking"]);

/**
 * A single AI review pass on a pull request diff against its PRD.
 * Multiple iterations accumulate over the fix→re-review cycle.
 */
export const aiReviews = pgTable(
  "ai_reviews",
  {
    id: text("id").primaryKey(),
    featureRequestId: text("feature_request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    pullRequestId: text("pull_request_id")
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    /** Monotonically increasing iteration count per feature request. */
    iteration: integer("iteration").notNull().default(1),
    summary: text("summary").notNull(),
    /** True when all blocking issues are resolved and the PR is ready for human review. */
    readyForHuman: boolean("ready_for_human").notNull().default(false),
    rawAnalysis: jsonb("raw_analysis").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_ai_reviews_feature_id").on(t.featureRequestId, t.createdAt),
    index("idx_ai_reviews_pull_request_id").on(t.pullRequestId),
  ],
);

/** An individual issue surfaced by an AI review pass. */
export const aiReviewIssues = pgTable(
  "ai_review_issues",
  {
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
    /** True once the developer has addressed this issue in a subsequent commit. */
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_ai_review_issues_review_id").on(t.aiReviewId),
  ],
);

/** Explicit human approval or rejection recorded after AI review passes. */
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
