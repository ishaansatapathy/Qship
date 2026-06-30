import "dotenv/config";

import { eq } from "drizzle-orm";

import { auth } from "../index";
import { db } from "@repo/database";
import {
  featureRequests,
  organizationMembers,
  organizations,
  projects,
  users,
} from "@repo/database/schema";
import {
  seedDemoPrd,
  seedDemoTasks,
} from "@repo/services/feature-request";
import { ensurePassingAiReview } from "@repo/services/demo-bootstrap";

const DEMO_EMAIL = process.env.SEED_USER_EMAIL ?? "demo@qship.dev";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "DemoPass123!";
const DEMO_NAME = "Qship Demo";

const DEMO_FEATURES = [
  {
    title: "OAuth login for enterprise customers",
    rawRequest:
      "Enterprise customers need SSO via Google and Microsoft. Must support domain-restricted signup and audit logs for admin review.",
    status: "prd_ready" as const,
  },
  {
    title: "Bulk export for compliance reports",
    rawRequest:
      "Compliance team wants CSV export of all shipped features with PR links, approver names, and AI review scores for quarterly audits. Notify #product-shipping in Slack when approved for release.",
    status: "human_review" as const,
  },
  {
    title: "Slack notification when PR is approved",
    rawRequest:
      "Notify #product-shipping in Slack when a feature passes human approval and is ready to deploy.",
    status: "submitted" as const,
  },
];

async function ensureDemoUser() {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, DEMO_EMAIL),
  });

  if (existing) {
    await db
      .update(users)
      .set({ autoApproveAgentEmail: true, emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log(`[seed] Demo user exists: ${DEMO_EMAIL}`);
    return existing;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      name: DEMO_NAME,
    },
  });

  if (!result?.user) {
    throw new Error("Failed to create demo user via BetterAuth");
  }

  await db
    .update(users)
    .set({ autoApproveAgentEmail: true, emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, result.user.id));

  console.log(`[seed] Demo user created: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  return result.user;
}

async function ensureWorkspace(userId: string) {
  const orgId = "org-shipflow-demo";
  const projectId = "proj-shipflow-core";

  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: "Qship Demo Org",
      slug: "shipflow-demo",
      planTier: "pro",
      // Generous credits so judges can run AI features without hitting the limit.
      aiReviewCredits: 999,
      repositoryLimit: 10,
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: { aiReviewCredits: 999, repositoryLimit: 10, planTier: "pro" },
    });

  await db
    .insert(organizationMembers)
    .values({
      id: "member-demo-owner",
      organizationId: orgId,
      userId,
      role: "owner",
    })
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: projectId,
      organizationId: orgId,
      name: "Core Platform",
      description: "Primary Qship delivery pipeline",
    })
    .onConflictDoNothing();

  return { orgId, projectId };
}

async function ensurePassingAiReviewForDemo(featureRequestId: string) {
  await ensurePassingAiReview(featureRequestId);
}

async function seedFeatures(orgId: string, projectId: string, userId: string) {
  for (const feature of DEMO_FEATURES) {
    const existing = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.title, feature.title),
    });
    if (existing) {
      if (feature.status === "human_review") {
        await ensurePassingAiReview(existing.id);
      }
      continue;
    }

    const id = crypto.randomUUID();
    await db.insert(featureRequests).values({
      id,
      organizationId: orgId,
      projectId,
      title: feature.title,
      rawRequest: feature.rawRequest,
      status: feature.status,
      createdByUserId: userId,
      source: "manual",
    });

    if (feature.status === "prd_ready" || feature.status === "human_review") {
      await seedDemoPrd(id, {
        problemStatement: feature.rawRequest,
        goals: ["Ship safely with human approval", "Keep audit trail for compliance"],
        nonGoals: ["Full SSO vendor marketplace in v1"],
        userStories: ["As an admin I can restrict signup by email domain"],
        acceptanceCriteria: ["Google OAuth works", "Audit log captures sign-in events"],
        edgeCases: ["Expired OAuth tokens", "Revoked workspace access"],
        successMetrics: ["<2 min time-to-first-ship for demo org"],
      });

      await seedDemoTasks(id, [
        {
          title: "Add OAuth provider config",
          description: "Wire Google OAuth in BetterAuth",
          status: "done",
        },
        {
          title: "Domain allowlist UI",
          description: "Settings page for allowed email domains",
          status: "in_progress",
        },
      ]);

      if (feature.status === "human_review") {
        await ensurePassingAiReviewForDemo(id);
      }
    }
  }

  console.log(`[seed] Feature requests synced (${DEMO_FEATURES.length} samples).`);
}

export async function runShipflowSeed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const user = await ensureDemoUser();
  const { orgId, projectId } = await ensureWorkspace(user.id);
  await seedFeatures(orgId, projectId, user.id);

  console.log("[seed] Qship demo workspace ready.");
  console.log(`       org:     ${orgId}`);
  console.log(`       project: ${projectId}`);
}
