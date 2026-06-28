import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";
import { repositories } from "./project";

/** A GitHub pull request linked to a ShipFlow feature request. */
export const pullRequests = pgTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    featureRequestId: text("feature_request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number").notNull(),
    githubPrId: text("github_pr_id").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    headSha: text("head_sha").notNull(),
    baseBranch: text("base_branch").notNull(),
    state: text("state").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /** Feature-scoped PR lookup (e.g., listing all PRs for a request). */
    index("idx_pull_requests_feature_id").on(t.featureRequestId),
    /** Repository-scoped PR listing. */
    index("idx_pull_requests_repository_id").on(t.repositoryId),
    /**
     * Prevents duplicate PR records from concurrent webhook deliveries.
     * A given PR number is unique within a repository.
     */
    uniqueIndex("idx_pull_requests_repo_pr_number").on(t.repositoryId, t.githubPrNumber),
  ],
);
