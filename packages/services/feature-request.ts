import { and, db, desc, eq } from "@repo/database";
import {
  clarificationMessages,
  engineeringTasks,
  featureRequests,
  prds,
  projects,
  type PrdContent,
} from "@repo/database/schema";

import type { DbTransaction } from "./db/transaction";
import { ServiceError } from "./errors";
import type { FeatureTriage } from "./feature-ai";
import { getMembershipForUser } from "./organization";
import type { FeatureStatus } from "./workflow";

// ── Workflow FSM ───────────────────────────────────────────────────────────────

/**
 * Allowed status transitions for feature requests.
 * Enforced by guardedUpdateFeatureStatus — prevents illegal state jumps.
 * Direct `updateFeatureStatus` is used internally by trusted service code only.
 */
const ALLOWED_TRANSITIONS: Partial<Record<FeatureStatus, FeatureStatus[]>> = {
  submitted:           ["clarifying", "prd_generating", "duplicate_education", "rejected"],
  clarifying:          ["prd_generating", "rejected"],
  duplicate_education: ["submitted", "rejected"],
  prd_generating:      ["prd_ready", "submitted"],
  prd_ready:           ["planning", "prd_generating"],
  planning:            ["plan_approved", "in_development", "prd_ready"],
  plan_approved:       ["in_development"],
  // "approved" removed: would bypass the human_review gate entirely.
  pr_open:             ["ai_review", "in_development", "fix_needed", "human_review"],
  ai_review:           ["human_review", "fix_needed", "pr_open"],
  // "human_review" removed: forces re-review before re-entering the approval queue.
  fix_needed:          ["ai_review", "pr_open"],
  in_development:      ["pr_open", "planning", "human_review"],
  human_review:        ["approved", "fix_needed", "rejected"],
  approved:            ["shipped"],
  shipped:             [],
  rejected:            ["submitted"],
};

/** Returns whether a feature status transition is allowed by the FSM. */
export function isFeatureTransitionAllowed(from: FeatureStatus, to: FeatureStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Validated status transition for tRPC/UI surfaces.
 * Throws PRECONDITION_FAILED on illegal jumps.
 * Internal service code (Inngest, webhooks) calls updateFeatureStatus directly.
 */
export async function guardedUpdateFeatureStatus(
  featureRequestId: string,
  from: FeatureStatus,
  to: FeatureStatus,
) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot transition feature from "${from}" to "${to}". Allowed: ${allowed.join(", ") || "none"}.`,
    );
  }
  const [row] = await db
    .update(featureRequests)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(featureRequests.id, featureRequestId), eq(featureRequests.status, from)))
    .returning();
  if (!row) {
    throw new ServiceError(
      "CONFLICT",
      `Cannot transition feature from "${from}" to "${to}": status changed concurrently. Refresh and retry.`,
    );
  }
  return row;
}

/** Reads current status and applies a validated FSM transition. */
export async function transitionFeatureStatus(
  featureRequestId: string,
  to: FeatureStatus,
) {
  const row = await db.query.featureRequests.findFirst({
    where: eq(featureRequests.id, featureRequestId),
    columns: { status: true },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Feature request not found");
  const from = row.status as FeatureStatus;
  if (from === to) {
    return row;
  }
  return guardedUpdateFeatureStatus(featureRequestId, from, to);
}

/** Atomic FSM transition inside an existing transaction. */
export async function guardedUpdateFeatureStatusInTx(
  tx: DbTransaction,
  featureRequestId: string,
  from: FeatureStatus,
  to: FeatureStatus,
) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      `Cannot transition feature from "${from}" to "${to}". Allowed: ${allowed.join(", ") || "none"}.`,
    );
  }
  const [row] = await tx
    .update(featureRequests)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(featureRequests.id, featureRequestId), eq(featureRequests.status, from)))
    .returning();
  if (!row) {
    throw new ServiceError(
      "CONFLICT",
      `Cannot transition feature from "${from}" to "${to}": status changed concurrently. Refresh and retry.`,
    );
  }
  return row;
}

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
      pullRequests: { with: { repository: true } },
      aiReviews: { with: { issues: true }, orderBy: (r, { desc: d }) => [d(r.createdAt)] },
      humanApprovals: { orderBy: (h, { desc: d }) => [d(h.createdAt)] },
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

/** FSM-validated status transition — all internal callers route through the same guard as tRPC. */
export async function updateFeatureStatus(
  featureRequestId: string,
  status: (typeof featureRequests.$inferSelect)["status"],
) {
  return transitionFeatureStatus(featureRequestId, status as FeatureStatus);
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
  "duplicate_education",
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
  tasks: {
    title: string;
    description: string;
    status?: "backlog" | "todo" | "in_progress" | "review" | "done";
    type?: string;
    acceptanceCriteria?: string[];
  }[],
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
        taskType: task.type?.trim() || null,
        acceptanceCriteria: task.acceptanceCriteria ?? [],
        sortOrder: index,
      })),
    )
    .returning();
  return rows;
}

export async function listTaskBoard(projectId: string) {
  const features = await db.query.featureRequests.findMany({
    where: eq(featureRequests.projectId, projectId),
    orderBy: [desc(featureRequests.updatedAt)],
    with: {
      tasks: {
        orderBy: (task, { asc }) => [asc(task.sortOrder), asc(task.createdAt)],
      },
    },
  });

  return features.flatMap((feature) =>
    (feature.tasks ?? []).map((task) => ({
      id: task.id,
      featureId: feature.id,
      featureTitle: feature.title,
      featureStatus: feature.status,
      title: task.title,
      description: task.description,
      status: task.status,
      sortOrder: task.sortOrder,
      updatedAt: task.updatedAt,
    })),
  );
}

export async function assertTaskInUserWorkspace(userId: string, taskId: string) {
  const ws = await getWorkspaceProjectForUser(userId);
  if (!ws) {
    throw new ServiceError("FORBIDDEN", "Join a workspace before accessing tasks");
  }

  const task = await db.query.engineeringTasks.findFirst({
    where: eq(engineeringTasks.id, taskId),
    with: { featureRequest: true },
  });
  if (!task) throw new ServiceError("NOT_FOUND", "Engineering task not found");
  if (task.featureRequest.projectId !== ws.project.id) {
    throw new ServiceError("FORBIDDEN", "Task is not in your workspace");
  }

  return { ws, task, feature: task.featureRequest };
}

export async function updateEngineeringTaskStatus(
  taskId: string,
  status: "backlog" | "todo" | "in_progress" | "review" | "done",
) {
  const [row] = await db
    .update(engineeringTasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(engineeringTasks.id, taskId))
    .returning();
  if (!row) throw new ServiceError("NOT_FOUND", "Engineering task not found");
  return row;
}

export type FeatureActivityKind =
  | "submitted"
  | "triage"
  | "education"
  | "prd"
  | "tasks"
  | "ai_review"
  | "status"
  | "clarification"
  | "human_review";

export type FeatureActivityEntry = {
  id: string;
  at: string;
  kind: FeatureActivityKind;
  title: string;
  detail?: string;
  actor: "user" | "agent" | "system";
};

export async function appendFeatureActivity(
  featureRequestId: string,
  event: {
    kind: FeatureActivityKind;
    title: string;
    detail?: string;
    actor?: "user" | "agent" | "system";
    at?: string;
  },
) {
  const existing = await getFeatureRequest(featureRequestId);
  const prior = (existing.metadata?.activity as FeatureActivityEntry[] | undefined) ?? [];
  const entry: FeatureActivityEntry = {
    id: crypto.randomUUID(),
    at: event.at ?? new Date().toISOString(),
    kind: event.kind,
    title: event.title,
    detail: event.detail,
    actor: event.actor ?? "system",
  };
  await updateFeatureMetadata(featureRequestId, {
    activity: [...prior, entry].slice(-50),
  });
  return entry;
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Clarifying",
  duplicate_education: "Already exists",
  prd_generating: "Generating PRD",
  prd_ready: "PRD ready",
  planning: "Planning",
  in_development: "In development",
  pr_open: "PR open",
  ai_review: "AI review",
  fix_needed: "Fixes needed",
  human_review: "Awaiting approval",
  approved: "Approved",
  shipped: "Shipped",
  rejected: "Rejected",
};

function nextStepForStatus(status: string, hasPrd: boolean, taskCount: number): string {
  switch (status) {
    case "submitted":
      return "Run AI triage or generate a PRD.";
    case "clarifying":
      return "Answer clarifying questions, then generate the PRD.";
    case "duplicate_education":
      return "Review the existing feature — proceed only if this is genuinely new scope.";
    case "prd_ready":
      return "Break the PRD into engineering tasks.";
    case "planning":
      return "Move to development when tasks are assigned.";
    case "in_development":
    case "pr_open":
      return "Run an AI review when the implementation is ready.";
    case "fix_needed":
      return "Address review findings, then re-run AI review.";
    case "human_review":
      return "A teammate should approve before ship.";
    case "approved":
      return "Mark as shipped when deployed.";
    default:
      if (!hasPrd) return "Generate a PRD to define scope.";
      if (taskCount === 0) return "Generate engineering tasks from the PRD.";
      return "Continue delivery on the current stage.";
  }
}

export async function getFeatureDeliveryView(featureId: string, userId?: string) {
  if (userId) {
    await assertFeatureInUserWorkspace(userId, featureId);
  }
  const feature = await getFeatureRequest(featureId);
  const triage = getTriageFromMetadata(feature.metadata);
  const logged = (feature.metadata?.activity as FeatureActivityEntry[] | undefined) ?? [];
  const lastReview = feature.metadata?.lastAiReview as
    | { at?: string; pass?: boolean; summary?: string; findings?: string[] }
    | undefined;

  const timeline: FeatureActivityEntry[] = [
    {
      id: "created",
      at: feature.createdAt.toISOString(),
      kind: "submitted",
      title: "Feature submitted",
      detail: feature.title,
      actor: "user",
    },
  ];

  if (triage && !logged.some((e) => e.kind === "triage")) {
    timeline.push({
      id: "triage",
      at: feature.updatedAt.toISOString(),
      kind: "triage",
      title: "AI triage completed",
      detail: triage.priority ? `Priority ${triage.priority} · ${triage.impactSummary}` : triage.impactSummary,
      actor: "agent",
    });
  }

  if (feature.prd) {
    timeline.push({
      id: `prd-${feature.prd.id}`,
      at: feature.prd.createdAt.toISOString(),
      kind: "prd",
      title: "PRD generated",
      detail: `${feature.prd.content.goals?.length ?? 0} goals · ${feature.prd.content.userStories?.length ?? 0} user stories`,
      actor: "agent",
    });
  }

  if (feature.tasks?.length) {
    const latestTask = feature.tasks.reduce((a, b) =>
      new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b,
    );
    timeline.push({
      id: "tasks-batch",
      at: latestTask.updatedAt.toISOString(),
      kind: "tasks",
      title: "Engineering tasks created",
      detail: `${feature.tasks.length} task(s) — ${feature.tasks.filter((t) => t.status === "done").length} done`,
      actor: "agent",
    });
  }

  for (const msg of feature.clarifications ?? []) {
    timeline.push({
      id: msg.id,
      at: msg.createdAt.toISOString(),
      kind: "clarification",
      title: msg.role === "user" ? "Clarification from user" : "Agent note",
      detail: msg.content.slice(0, 160),
      actor: msg.role === "user" ? "user" : "agent",
    });
  }

  if (lastReview?.at && !logged.some((e) => e.kind === "ai_review" && e.at === lastReview.at)) {
    timeline.push({
      id: `review-${lastReview.at}`,
      at: lastReview.at,
      kind: "ai_review",
      title: lastReview.pass ? "AI review passed" : "AI review — fixes needed",
      detail: lastReview.summary,
      actor: "agent",
    });
  }

  timeline.push(...logged);

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const statusLabel = STATUS_LABELS[feature.status] ?? feature.status;
  const taskCount = feature.tasks?.length ?? 0;
  const hasPrd = Boolean(feature.prd);
  const nextStep = nextStepForStatus(feature.status, hasPrd, taskCount);

  const summaryParts = [
    `"${feature.title}" is at ${statusLabel}.`,
    lastReview?.summary ? `Latest AI review: ${lastReview.summary}` : null,
  ].filter(Boolean);

  return {
    featureId: feature.id,
    title: feature.title,
    status: feature.status,
    statusLabel,
    summary: summaryParts.join(" "),
    nextStep,
    timeline,
    counts: {
      tasks: taskCount,
      clarifications: feature.clarifications?.length ?? 0,
      goals: feature.prd?.content.goals?.length ?? 0,
    },
  };
}
