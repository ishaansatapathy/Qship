import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { featureRequests } from "./feature-request";

export type PrdContent = {
  problemStatement: string;
  goals: string[];
  nonGoals: string[];
  userStories: string[];
  acceptanceCriteria: string[];
  edgeCases: string[];
  successMetrics: string[];
};

export const prds = pgTable("prds", {
  id: text("id").primaryKey(),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequests.id, { onDelete: "cascade" })
    .unique(),
  content: jsonb("content").$type<PrdContent>().notNull(),
  version: text("version").notNull().default("1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
