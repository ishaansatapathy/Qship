import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { workflowRuns } from "@repo/database/schema";

import { ServiceError } from "./errors";

type WorkflowType =
  | "prd_generation"
  | "task_generation"
  | "repo_analysis"
  | "pr_processing"
  | "ai_review"
  | "re_review"
  | "release_readiness";

type WorkflowStatus = "pending" | "running" | "completed" | "failed";

export const WORKFLOW_CANCELLED_ERROR = "Cancelled by user";

export class WorkflowCancelledError extends Error {
  constructor() {
    super(WORKFLOW_CANCELLED_ERROR);
    this.name = "WorkflowCancelledError";
  }
}

export async function getWorkflowRun(id: string) {
  return db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, id) });
}

/** Throws WorkflowCancelledError when the run was stopped from the UI. */
export async function assertWorkflowRunActive(workflowRunId: string) {
  const run = await getWorkflowRun(workflowRunId);
  if (!run) throw new ServiceError("NOT_FOUND", "Workflow run not found");
  if (run.status === "failed" && run.error === WORKFLOW_CANCELLED_ERROR) {
    throw new WorkflowCancelledError();
  }
}

export async function cancelWorkflowRun(id: string) {
  const run = await getWorkflowRun(id);
  if (!run) throw new ServiceError("NOT_FOUND", "Workflow run not found");
  if (run.status !== "pending" && run.status !== "running") {
    throw new ServiceError("PRECONDITION_FAILED", "Only active workflows can be cancelled");
  }
  return updateWorkflowRun(id, {
    status: "failed",
    message: "Cancelled",
    error: WORKFLOW_CANCELLED_ERROR,
  });
}

export async function cancelActiveWorkflowRuns(featureRequestId: string, type?: WorkflowType) {
  const runs = await listWorkflowRunsForFeature(featureRequestId);
  const active = runs.filter(
    (r) =>
      (r.status === "pending" || r.status === "running") && (!type || r.type === type),
  );
  for (const run of active) {
    await cancelWorkflowRunWithCleanup(run.id);
  }
  return { cancelled: active.length };
}

/** Cancel a run and revert feature status when the workflow was mid-flight. */
export async function cancelWorkflowRunWithCleanup(id: string) {
  const run = await getWorkflowRun(id);
  if (!run) throw new ServiceError("NOT_FOUND", "Workflow run not found");

  const row = await cancelWorkflowRun(id);

  if (run.featureRequestId) {
    const { getFeatureRequest, updateFeatureStatus } = await import("./feature-request");
    const feature = await getFeatureRequest(run.featureRequestId);
    if (run.type === "prd_generation" && feature.status === "prd_generating") {
      await updateFeatureStatus(feature.id, "submitted");
    }
    if (run.type === "task_generation" && feature.status === "planning") {
      await updateFeatureStatus(feature.id, "prd_ready");
    }
    if (run.type === "ai_review" && feature.status === "ai_review") {
      await updateFeatureStatus(feature.id, "pr_open");
    }
  }

  return row;
}

export async function createWorkflowRun(input: {
  featureRequestId: string;
  type: WorkflowType;
  message?: string;
}) {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(workflowRuns)
    .values({
      id,
      featureRequestId: input.featureRequestId,
      type: input.type,
      status: "pending",
      progress: 0,
      message: input.message ?? "Queued…",
    })
    .returning();
  return row!;
}

export async function updateWorkflowRun(
  id: string,
  patch: {
    status?: WorkflowStatus;
    /** Completion percentage in the range [0, 100]. */
    progress?: number;
    message?: string;
    result?: Record<string, unknown>;
    error?: string | null;
    inngestEventId?: string;
  },
) {
  const [row] = await db
    .update(workflowRuns)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(workflowRuns.id, id))
    .returning();
  return row ?? null;
}

export async function listWorkflowRunsForFeature(featureRequestId: string) {
  return db.query.workflowRuns.findMany({
    where: eq(workflowRuns.featureRequestId, featureRequestId),
    orderBy: [desc(workflowRuns.createdAt)],
    limit: 10,
  });
}

export async function getActiveWorkflowForFeature(featureRequestId: string) {
  const rows = await db.query.workflowRuns.findMany({
    where: eq(workflowRuns.featureRequestId, featureRequestId),
    orderBy: [desc(workflowRuns.createdAt)],
    limit: 5,
  });
  return rows.find((r) => r.status === "pending" || r.status === "running") ?? null;
}

export async function getActiveWorkflowOfType(featureRequestId: string, type: WorkflowType) {
  const rows = await db.query.workflowRuns.findMany({
    where: eq(workflowRuns.featureRequestId, featureRequestId),
    orderBy: [desc(workflowRuns.createdAt)],
    limit: 10,
  });
  return (
    rows.find(
      (r) => r.type === type && (r.status === "pending" || r.status === "running"),
    ) ?? null
  );
}
