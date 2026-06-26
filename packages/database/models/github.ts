import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";
import { repositories } from "./project";

export const pullRequests = pgTable("pull_requests", {
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
});
