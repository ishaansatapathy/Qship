import { db, desc, eq } from "@repo/database";
import {
  clarificationMessages,
  engineeringTasks,
  featureRequests,
  prds,
  projects,
  type PrdContent,
} from "@repo/database/schema";

import { ServiceError } from "./errors";
import type { FeatureTriage } from "./feature-ai";
import { getMembershipForUser } from "./organization";

export async function getWorkspaceProjectForUser(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) return null;

  const project = await db.query.projects.findFirst({
    where: eq(projects.organizationId, membership.organizationId),
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });

  if (!project) return null;

  return {
    organization: membership.organization,
    project,
    role: membership.role,
  };
}

export async function listFeatureRequests(projectId: string) {
  return db.query.featureRequests.findMany({
    where: eq(featureRequests.projectId, projectId),
    orderBy: [desc(featureRequests.updatedAt)],
    with: { prd: true },
  });
}

export async function getFeatureRequest(id: string) {
  const row = await db.query.featureRequests.findFirst({
    where: eq(featureRequests.id, id),
    with: {
      prd: true,
      tasks: true,
      clarifications: true,
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Feature request not found");
  return row;
}

export async function createFeatureRequest(input: {
  organizationId: string;
  projectId: string;
  title: string;
  rawRequest: string;
  createdByUserId?: string;
  source?: "manual" | "email" | "support_ticket" | "customer_call" | "api";
}) {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(featureRequests)
    .values({
      id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      title: input.title.trim(),
      rawRequest: input.rawRequest.trim(),
      createdByUserId: input.createdByUserId,
      source: input.source ?? "manual",
      status: "submitted",
    })
    .returning();
  return row!;
}

export async function updateFeatureMetadata(
  featureRequestId: string,
  metadata: Record<string, unknown>,
) {
  const existing = await getFeatureRequest(featureRequestId);
  const merged = { ...(existing.metadata ?? {}), ...metadata };
  const [row] = await db
    .update(featureRequests)
    .set({ metadata: merged, updatedAt: new Date() })
    .where(eq(featureRequests.id, featureRequestId))
    .returning();
  return row!;
}

export async function updateFeatureStatus(
  featureRequestId: string,
  status: (typeof featureRequests.$inferSelect)["status"],
) {
  const [row] = await db
    .update(featureRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(featureRequests.id, featureRequestId))
    .returning();
  if (!row) throw new ServiceError("NOT_FOUND", "Feature request not found");
  return row;
}

export async function saveFeaturePrd(featureRequestId: string, content: PrdContent) {
  const existing = await db.query.prds.findFirst({
    where: eq(prds.featureRequestId, featureRequestId),
  });

  if (existing) {
    const [row] = await db
      .update(prds)
      .set({ content, updatedAt: new Date() })
      .where(eq(prds.id, existing.id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(prds)
    .values({
      id: crypto.randomUUID(),
      featureRequestId,
      content,
      version: "1",
    })
    .returning();
  return row!;
}

const ATTENTION_STATUSES = new Set([
  "clarifying",
  "fix_needed",
  "human_review",
  "submitted",
]);

export async function getPipelineSummary(projectId: string) {
  const rows = await db.query.featureRequests.findMany({
    where: eq(featureRequests.projectId, projectId),
    columns: { id: true, status: true },
  });

  const counts = {
    total: rows.length,
    submitted: 0,
    inDelivery: 0,
    awaitingApproval: 0,
    shipped: 0,
    needsAttention: 0,
  };

  for (const row of rows) {
    if (row.status === "submitted" || row.status === "clarifying") counts.submitted += 1;
    if (["in_development", "pr_open", "ai_review", "fix_needed", "planning", "plan_approved", "prd_generating", "prd_ready"].includes(row.status)) {
      counts.inDelivery += 1;
    }
    if (row.status === "human_review") counts.awaitingApproval += 1;
    if (row.status === "shipped" || row.status === "approved") counts.shipped += 1;
    if (ATTENTION_STATUSES.has(row.status)) counts.needsAttention += 1;
  }

  return counts;
}

export function getTriageFromMetadata(metadata: Record<string, unknown> | null | undefined): FeatureTriage | null {
  const triage = metadata?.triage;
  if (!triage || typeof triage !== "object") return null;
  return triage as FeatureTriage;
}

export async function seedDemoPrd(featureRequestId: string, content: PrdContent) {
  await db
    .insert(prds)
    .values({
      id: crypto.randomUUID(),
      featureRequestId,
      content,
      version: "1",
    })
    .onConflictDoNothing();
}

export async function seedDemoTasks(
  featureRequestId: string,
  tasks: { title: string; description: string; status: "backlog" | "todo" | "in_progress" | "review" | "done" }[],
) {
  await db.insert(engineeringTasks).values(
    tasks.map((task, index) => ({
      id: crypto.randomUUID(),
      featureRequestId,
      title: task.title,
      description: task.description,
      status: task.status,
      sortOrder: index,
    })),
  );
}

export async function addClarificationMessage(input: {
  featureRequestId: string;
  role: "user" | "agent" | "system";
  content: string;
}) {
  const [row] = await db
    .insert(clarificationMessages)
    .values({
      id: crypto.randomUUID(),
      featureRequestId: input.featureRequestId,
      role: input.role,
      content: input.content,
    })
    .returning();
  return row!;
}

export async function assertFeatureInUserWorkspace(userId: string, featureId: string) {
  const ws = await getWorkspaceProjectForUser(userId);
  if (!ws) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before accessing feature requests");
  }
  const feature = await getFeatureRequest(featureId);
  if (feature.projectId !== ws.project.id) {
    throw new ServiceError("FORBIDDEN", "Feature request is not in your workspace");
  }
  return { ws, feature };
}

export async function replaceFeatureTasks(
  featureRequestId: string,
  tasks: { title: string; description: string; status?: "backlog" | "todo" | "in_progress" | "review" | "done" }[],
) {
  await db.delete(engineeringTasks).where(eq(engineeringTasks.featureRequestId, featureRequestId));
  if (tasks.length === 0) return [];

  const rows = await db
    .insert(engineeringTasks)
    .values(
      tasks.map((task, index) => ({
        id: crypto.randomUUID(),
        featureRequestId,
        title: task.title.trim(),
        description: task.description.trim(),
        status: task.status ?? "todo",
        sortOrder: index,
      })),
    )
    .returning();
  return rows;
}
