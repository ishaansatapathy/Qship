import { eq, inArray } from "@repo/database";
import db from "@repo/database";
import { engineeringTasks, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { generateFeatureImplementation, validateGeneratedCodeGate } from "../feature-codegen";
import { ServiceError } from "../errors";
import {
  appendFeatureActivity,
  getFeatureRequest,
  transitionFeatureStatus,
} from "../feature-request";
import { commitGeneratedFilesToFeatureBranch } from "../github/code-commit";
import { createFeaturePullRequest } from "../github/pr";
import { fetchRepoSnippetsForTask, type RepoFileSnippet } from "../github/repo-context";
import { getInstallationOctokit } from "../github/client";
import { assertWorkflowRunActive, updateWorkflowRun } from "../workflow-runs";

export async function runCodeImplementationWorkflow(input: {
  featureId: string;
  userId: string;
  organizationId: string;
  installationId: string;
  repositoryId: string;
  workflowRunId: string;
}) {
  try {
    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      status: "running",
      progress: 10,
      message: "Loading PRD and engineering tasks…",
    });

    const feature = await getFeatureRequest(input.featureId);
    if (!feature.prd?.content) {
      throw new ServiceError("PRECONDITION_FAILED", "Generate a PRD before implementing code");
    }
    if (!feature.tasks?.length) {
      throw new ServiceError("PRECONDITION_FAILED", "Generate engineering tasks before implementing code");
    }

    const repoRow = await db.query.repositories.findFirst({
      where: eq(repositories.id, input.repositoryId),
    });
    if (!repoRow || repoRow.organizationId !== input.organizationId) {
      throw new ServiceError("NOT_FOUND", "Repository not found in workspace");
    }

    if (["planning", "plan_approved", "prd_ready"].includes(feature.status)) {
      await transitionFeatureStatus(input.featureId, "in_development");
    }

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 30,
      message: "Analyzing linked repository context…",
    });

    const [owner, name] = repoRow.fullName.split("/");
    if (!owner || !name) {
      throw new ServiceError("PRECONDITION_FAILED", "Invalid repository full name");
    }
    const octokit = getInstallationOctokit(input.installationId);
    const primaryTask = feature.tasks[0]!;

    let repoSnippets: RepoFileSnippet[] = [];
    let repoContextNote = "";
    try {
      repoSnippets = await fetchRepoSnippetsForTask(
        octokit,
        owner,
        name,
        primaryTask.title,
        primaryTask.description,
        5,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn("code_implementation.repo_context_skipped", {
        featureId: input.featureId,
        message: errMsg,
      });
      repoContextNote = " (no repo context — using PRD only)";
      repoSnippets = [];
    }

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 50,
      message: `Generating implementation files with AI…${repoContextNote}`,
    });

    const codegen = await generateFeatureImplementation({
      featureId: input.featureId,
      title: feature.title,
      rawRequest: feature.rawRequest,
      prd: feature.prd.content,
      tasks: feature.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        taskType: t.taskType,
        acceptanceCriteria: t.acceptanceCriteria,
      })),
      repoSnippets,
    });

    validateGeneratedCodeGate(codegen.files);

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 75,
      message: `Committing ${codegen.files.length} file(s) to GitHub…`,
    });

    const commit = await commitGeneratedFilesToFeatureBranch({
      installationId: input.installationId,
      owner,
      repo: name,
      defaultBranch: repoRow.defaultBranch,
      featureId: input.featureId,
      featureTitle: feature.title,
      files: codegen.files,
    });

    await assertWorkflowRunActive(input.workflowRunId);
    await updateWorkflowRun(input.workflowRunId, {
      progress: 90,
      message: "Opening pull request…",
    });

    const pr = await createFeaturePullRequest({
      organizationId: input.organizationId,
      installationId: input.installationId,
      featureId: input.featureId,
      repositoryId: input.repositoryId,
    });

    const taskIdsToComplete = feature.tasks.slice(0, Math.min(3, feature.tasks.length)).map((t) => t.id);

    if (taskIdsToComplete.length > 0) {
      await db
        .update(engineeringTasks)
        .set({ status: "review" })
        .where(inArray(engineeringTasks.id, taskIdsToComplete));
    }

    await appendFeatureActivity(input.featureId, {
      kind: "status",
      title: "AI implementation committed",
      detail: `${commit.committedPaths.length} file(s) · PR #${pr.number}`,
      actor: "agent",
    });

    await updateWorkflowRun(input.workflowRunId, {
      status: "completed",
      progress: 100,
      message: `${codegen.files.length} files committed · PR #${pr.number} ready for review`,
      result: {
        featureId: input.featureId,
        fileCount: codegen.files.length,
        paths: commit.committedPaths,
        pullRequestUrl: pr.url,
        implementationNotes: codegen.implementationNotes,
      },
    });

    return { pr, commit, codegen };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateWorkflowRun(input.workflowRunId, {
      status: "failed",
      progress: 100,
      message: "Code implementation failed",
      error: message,
    });
    throw error;
  }
}
