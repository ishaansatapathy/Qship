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
