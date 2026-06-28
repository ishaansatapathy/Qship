import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { workflowRuns } from "@repo/database/schema";

type WorkflowType =
  | "prd_generation"
  | "task_generation"
  | "repo_analysis"
  | "pr_processing"
  | "ai_review"
  | "re_review"
  | "release_readiness";

type WorkflowStatus = "pending" | "running" | "completed" | "failed";

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
