import type { PrdContent } from "@repo/database/schema";
import { generateFeaturePrd } from "../feature-ai";
import { updateFeatureStatus, appendFeatureActivity, getFeatureRequest, saveFeaturePrd } from "../feature-request";
import { assertWorkflowRunActive, updateWorkflowRun, WorkflowCancelledError } from "../workflow-runs";

export async function runPrdGenerationWorkflow(input: {
  featureId: string;
  workflowRunId: string;
}) {
  try {
    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      status: "running",
      progress: 15,
      message: "Reading feature request…",
    });

    const feature = await getFeatureRequest(input.featureId);
    await updateFeatureStatus(input.featureId, "prd_generating");

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 45,
      message: "Generating structured PRD with AI…",
    });

    const content = await generateFeaturePrd({
      title: feature.title,
      rawRequest: feature.rawRequest,
    });

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 80,
      message: "Saving PRD to workspace…",
    });

    const prd = await saveFeaturePrd(input.featureId, content);
    await updateFeatureStatus(input.featureId, "prd_ready");
    await appendFeatureActivity(input.featureId, {
      kind: "prd",
      title: "PRD generated",
      detail: `Version ${prd.version}`,
      actor: "agent",
    });

    await updateWorkflowRun(input.workflowRunId, {
      status: "completed",
      progress: 100,
      message: "PRD ready",
      result: { prdId: prd.id, featureId: input.featureId },
    });

    return { prd };
  } catch (error) {
    if (error instanceof WorkflowCancelledError) {
      return { cancelled: true as const };
    }
    const message = error instanceof Error ? error.message : String(error);
    await updateWorkflowRun(input.workflowRunId, {
      status: "failed",
      progress: 100,
      message: "PRD generation failed",
      error: message,
    });
    throw error;
  }
}

// ── Inngest multi-step exports ─────────────────────────────────────────────────

/** Step 1: OpenAI call — result is memoised by Inngest on retry. */
export async function runPrdAiStep(input: { featureId: string; workflowRunId: string }): Promise<PrdContent> {
  await updateWorkflowRun(input.workflowRunId, {
    status: "running",
    progress: 45,
    message: "Generating structured PRD with AI…",
  });
  const feature = await getFeatureRequest(input.featureId);
  await updateFeatureStatus(input.featureId, "prd_generating");
  return generateFeaturePrd({ title: feature.title, rawRequest: feature.rawRequest });
}

/** Step 2: DB persist — safe to retry independently without re-calling OpenAI. */
export async function runPrdPersistStep(
  input: { featureId: string; workflowRunId: string },
  content: PrdContent,
) {
  await updateWorkflowRun(input.workflowRunId, { progress: 85, message: "Saving PRD to workspace…" });
  const prd = await saveFeaturePrd(input.featureId, content);
  await updateFeatureStatus(input.featureId, "prd_ready");
  await appendFeatureActivity(input.featureId, {
    kind: "prd",
    title: "PRD generated",
    detail: `Version ${prd.version}`,
    actor: "agent",
  });
  await updateWorkflowRun(input.workflowRunId, {
    status: "completed",
    progress: 100,
    message: "PRD ready",
    result: { prdId: prd.id, featureId: input.featureId },
  });
  return { prd };
}
