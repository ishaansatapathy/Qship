import { relations } from "drizzle-orm";

import { users, sessions, accounts } from "./models/auth";
import { organizationMembers, organizations } from "./models/organization";
import { projects, repositories } from "./models/project";
import { clarificationMessages, featureRequests } from "./models/feature-request";
import { prds } from "./models/prd";
import { engineeringTasks } from "./models/task";
import { pullRequests } from "./models/github";
import { aiReviewIssues, aiReviews, humanApprovals } from "./models/review";
import { workflowRuns } from "./models/workflow";
import { agentChatSessionsTable } from "./models/agent-chat-session";
import { agentChatHistoryTable } from "./models/agent-chat-history";

// ─── Auth ────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(organizationMembers),
  humanApprovals: many(humanApprovals),
  agentChatSessions: many(agentChatSessionsTable),
  agentChatHistory: one(agentChatHistoryTable, {
    fields: [users.id],
    references: [agentChatHistoryTable.userId],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// ─── Organization ────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  projects: many(projects),
  repositories: many(repositories),
  featureRequests: many(featureRequests),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

// ─── Project / Repository ─────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  featureRequests: many(featureRequests),
  repositories: many(repositories),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [repositories.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [repositories.projectId],
    references: [projects.id],
  }),
  pullRequests: many(pullRequests),
}));

// ─── Feature Request ─────────────────────────────────────────────────────────

export const featureRequestsRelations = relations(featureRequests, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [featureRequests.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [featureRequests.projectId],
    references: [projects.id],
  }),
  createdBy: one(users, {
    fields: [featureRequests.createdByUserId],
    references: [users.id],
  }),
  clarifications: many(clarificationMessages),
  prd: one(prds, {
    fields: [featureRequests.id],
    references: [prds.featureRequestId],
  }),
  tasks: many(engineeringTasks),
  pullRequests: many(pullRequests),
  aiReviews: many(aiReviews),
  humanApprovals: many(humanApprovals),
  workflowRuns: many(workflowRuns),
}));

export const clarificationMessagesRelations = relations(clarificationMessages, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [clarificationMessages.featureRequestId],
    references: [featureRequests.id],
  }),
}));

// ─── PRD ─────────────────────────────────────────────────────────────────────

export const prdsRelations = relations(prds, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [prds.featureRequestId],
    references: [featureRequests.id],
  }),
}));

// ─── Engineering Tasks ────────────────────────────────────────────────────────

export const engineeringTasksRelations = relations(engineeringTasks, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [engineeringTasks.featureRequestId],
    references: [featureRequests.id],
  }),
}));

// ─── Pull Requests ────────────────────────────────────────────────────────────

export const pullRequestsRelations = relations(pullRequests, ({ one, many }) => ({
  featureRequest: one(featureRequests, {
    fields: [pullRequests.featureRequestId],
    references: [featureRequests.id],
  }),
  repository: one(repositories, {
    fields: [pullRequests.repositoryId],
    references: [repositories.id],
  }),
  aiReviews: many(aiReviews),
}));

// ─── AI Reviews ──────────────────────────────────────────────────────────────

export const aiReviewsRelations = relations(aiReviews, ({ one, many }) => ({
  featureRequest: one(featureRequests, {
    fields: [aiReviews.featureRequestId],
    references: [featureRequests.id],
  }),
  pullRequest: one(pullRequests, {
    fields: [aiReviews.pullRequestId],
    references: [pullRequests.id],
  }),
  issues: many(aiReviewIssues),
}));

export const aiReviewIssuesRelations = relations(aiReviewIssues, ({ one }) => ({
  aiReview: one(aiReviews, {
    fields: [aiReviewIssues.aiReviewId],
    references: [aiReviews.id],
  }),
}));

export const humanApprovalsRelations = relations(humanApprovals, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [humanApprovals.featureRequestId],
    references: [featureRequests.id],
  }),
  reviewer: one(users, {
    fields: [humanApprovals.reviewerUserId],
    references: [users.id],
  }),
}));

// ─── Workflow Runs ────────────────────────────────────────────────────────────

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  featureRequest: one(featureRequests, {
    fields: [workflowRuns.featureRequestId],
    references: [featureRequests.id],
  }),
}));

// ─── Agent ───────────────────────────────────────────────────────────────────

export const agentChatSessionsRelations = relations(agentChatSessionsTable, ({ one }) => ({
  user: one(users, {
    fields: [agentChatSessionsTable.userId],
    references: [users.id],
  }),
}));

export const agentChatHistoryRelations = relations(agentChatHistoryTable, ({ one }) => ({
  user: one(users, {
    fields: [agentChatHistoryTable.userId],
    references: [users.id],
  }),
}));
