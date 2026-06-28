import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const planTierEnum = pgEnum("plan_tier", ["free", "pro", "enterprise"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);

/**
 * Billing lifecycle states mirroring Razorpay subscription statuses.
 * - active:    subscription is current and in good standing
 * - past_due:  payment failed; grace period in effect
 * - canceled:  subscription explicitly terminated
 * - trialing:  within a free trial window
 * - paused:    subscription temporarily halted (e.g. by merchant)
 */
export const billingStatusEnum = pgEnum("billing_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
  "paused",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    planTier: planTierEnum("plan_tier").notNull().default("free"),
    /** Remaining AI review credits for the current billing cycle. */
    aiReviewCredits: integer("ai_review_credits").notNull().default(10),
    /** Maximum number of linked GitHub repositories allowed on this plan. */
    repositoryLimit: integer("repository_limit").notNull().default(1),
    razorpayCustomerId: text("razorpay_customer_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    billingStatus: billingStatusEnum("billing_status").notNull().default("active"),
    githubInstallationId: text("github_installation_id"),
    githubAccountLogin: text("github_account_login"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_organizations_github_installation").on(t.githubInstallationId),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_member_unique").on(t.organizationId, t.userId),
  ],
);
