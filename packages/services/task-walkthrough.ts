import { asc, eq } from "@repo/database";
import db from "@repo/database";
import { repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "./errors";

import type { TaskWalkthrough } from "./feature-ai";
import { generateTaskWalkthrough } from "./feature-ai";
import {
  assertTaskInUserWorkspace,
  getFeatureRequest,
  getWorkspaceProjectForUser,
} from "./feature-request";
import { getInstallationOctokit } from "./github/client";
import { getGithubConnectionForUser } from "./github/installation";
import { fetchRepoSnippetsForTask } from "./github/repo-context";

export type ExplainEngineeringTaskInput = {
  taskId: string;
  depth?: "brief" | "full";
  analyzeRepo?: boolean;
};

export type ExplainEngineeringTaskResult = {
  walkthrough: TaskWalkthrough;
  taskId: string;
  featureId: string;
  taskIndex: number;
  totalTasks: number;
  repository: string | null;
  repoSnippetCount: number;
};

function orderTasks<T extends { sortOrder: number; createdAt: Date; id: string }>(
  tasks: T[],
): T[] {
  return [...tasks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function resolveTaskIndex(tasks: { id: string }[], taskId: string): number {
  const idx = tasks.findIndex((t) => t.id === taskId);
  return idx >= 0 ? idx + 1 : 1;
}

/** Prefer PR-linked repo, then first synced org repository. */
export async function resolveFeatureRepositoryFullName(
  userId: string,
  featureId: string,
): Promise<string | null> {
  const feature = await getFeatureRequest(featureId);
  const linkedPr = [...(feature.pullRequests ?? [])].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  )[0];
  if (linkedPr?.repository?.fullName) {
    return linkedPr.repository.fullName;
  }

  const ws = await getWorkspaceProjectForUser(userId);
  if (!ws) return null;

  const rows = await db.query.repositories.findMany({
    where: eq(repositories.organizationId, ws.organization.id),
    orderBy: [asc(repositories.fullName)],
    limit: 1,
  });
  return rows[0]?.fullName ?? null;
}

export async function explainEngineeringTaskForUser(
  userId: string,
  input: ExplainEngineeringTaskInput,
): Promise<ExplainEngineeringTaskResult> {
  const taskId = input.taskId.trim();
  if (!taskId) {
    throw new ServiceError("BAD_REQUEST", "taskId is required");
  }

  const depth = input.depth === "full" ? "full" : "brief";
  const analyzeRepo = input.analyzeRepo === true;

  const { task, feature } = await assertTaskInUserWorkspace(userId, taskId);
  const featureDetail = await getFeatureRequest(feature.id);
  const orderedTasks = orderTasks(featureDetail.tasks ?? []);
  const taskIndex = resolveTaskIndex(orderedTasks, task.id);
  const totalTasks = orderedTasks.length || 1;

  let repository: string | null = null;
  let repoSnippets: { path: string; excerpt: string }[] | undefined;

  if (analyzeRepo) {
    const gh = await getGithubConnectionForUser(userId);
    repository = await resolveFeatureRepositoryFullName(userId, feature.id);

    if (gh.connected && gh.installationId && repository) {
      const [owner, repo] = repository.split("/");
      if (owner && repo) {
        try {
          const octokit = getInstallationOctokit(gh.installationId);
          repoSnippets = await fetchRepoSnippetsForTask(
            octokit,
            owner,
            repo,
            task.title,
            task.description,
          );
        } catch (error) {
          logger.warn("task_walkthrough.repo_scan_failed", {
            featureId: feature.id,
            taskId,
            repository,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  const walkthrough = await generateTaskWalkthrough({
    taskTitle: task.title,
    taskDescription: task.description,
    taskIndex,
    totalTasks,
    featureTitle: feature.title,
    prd: featureDetail.prd?.content ?? null,
    depth,
    repoSnippets,
  });

  return {
    walkthrough,
    taskId: task.id,
    featureId: feature.id,
    taskIndex,
    totalTasks,
    repository,
    repoSnippetCount: repoSnippets?.length ?? 0,
  };
}

/** Next task in sort order after the current one (for walkthrough progression). */
export async function getNextEngineeringTaskId(
  userId: string,
  currentTaskId: string,
): Promise<string | null> {
  const { task, feature } = await assertTaskInUserWorkspace(userId, currentTaskId);
  const featureDetail = await getFeatureRequest(feature.id);
  const ordered = orderTasks(featureDetail.tasks ?? []);
  const idx = ordered.findIndex((t) => t.id === task.id);
  if (idx < 0 || idx >= ordered.length - 1) return null;
  return ordered[idx + 1]!.id;
}
