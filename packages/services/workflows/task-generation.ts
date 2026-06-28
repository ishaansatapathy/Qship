import { generateFeatureTasks } from "../feature-ai";
import {
  appendFeatureActivity,
  getFeatureRequest,
  replaceFeatureTasks,
  updateFeatureStatus,
} from "../feature-request";
import { ServiceError } from "../errors";
import { updateWorkflowRun } from "../workflow-runs";

export async function runTaskGenerationWorkflow(input: {
  featureId: string;
  workflowRunId: string;
}) {
  try {
    await updateWorkflowRun(input.workflowRunId, {
      status: "running",
      progress: 20,
      message: "Loading PRD…",
    });

    const feature = await getFeatureRequest(input.featureId);
    if (!feature.prd?.content) {
      throw new ServiceError("PRECONDITION_FAILED", "Generate a PRD before creating tasks");
    }

    await updateWorkflowRun(input.workflowRunId, {
      progress: 50,
      message: "Breaking PRD into engineering tasks…",
    });

    const drafts = await generateFeatureTasks({
      title: feature.title,
      rawRequest: feature.rawRequest,
      prd: feature.prd.content,
    });

    await updateWorkflowRun(input.workflowRunId, {
      progress: 85,
      message: "Saving task board…",
    });

    const tasks = await replaceFeatureTasks(input.featureId, drafts);
    await updateFeatureStatus(input.featureId, "planning");
    await appendFeatureActivity(input.featureId, {
      kind: "tasks",
      title: "Engineering tasks generated",
      detail: `${tasks.length} task(s)`,
      actor: "agent",
    });

    await updateWorkflowRun(input.workflowRunId, {
      status: "completed",
      progress: 100,
      message: `${tasks.length} tasks ready`,
      result: { taskCount: tasks.length, featureId: input.featureId },
    });

    return { tasks };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateWorkflowRun(input.workflowRunId, {
      status: "failed",
      progress: 100,
      message: "Task generation failed",
      error: message,
    });
    throw error;
  }
}
