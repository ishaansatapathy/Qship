import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organizations } from "./organization";

/** A logical grouping of feature requests within an organization. */
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** A GitHub repository linked to an organization (and optionally a project). */
export const repositories = pgTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    githubInstallationId: text("github_installation_id"),
    githubRepoId: text("github_repo_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    webhookSecret: text("webhook_secret"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    /**
     * Webhook routing: incoming events carry `repository.full_name`
     * and must be matched to a local record efficiently.
     */
    uniqueIndex("idx_repositories_full_name").on(t.fullName),
    index("idx_repositories_org_id").on(t.organizationId),
  ],
);
