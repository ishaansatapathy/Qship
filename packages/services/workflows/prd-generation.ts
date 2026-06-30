import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations, repositories } from "@repo/database/schema";
import type { PrdContent } from "@repo/database/schema";
import { logger } from "@repo/logger";

import type { PrdRepoContext } from "../feature-ai";
import { generateFeaturePrd } from "../feature-ai";
import { updateFeatureStatus, appendFeatureActivity, getFeatureRequest, saveFeaturePrd } from "../feature-request";
import { assertWorkflowRunActive, updateWorkflowRun, WorkflowCancelledError } from "../workflow-runs";
import { getInstallationOctokit } from "../github/client";
import { fetchRepoSnippetsForTask } from "../github/repo-context";

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

/**
 * Attempts to fetch relevant code snippets from the organisation's linked repo.
 * Returns null if no GitHub connection is configured — PRD generation always
 * proceeds; repo context is additive.
 */
async function fetchRepoContextForPrd(
  organizationId: string,
  featureTitle: string,
  featureRawRequest: string,
): Promise<PrdRepoContext | null> {
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { githubInstallationId: true },
    });

    if (!org?.githubInstallationId) return null;

    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.organizationId, organizationId),
      columns: { owner: true, name: true, fullName: true },
      orderBy: (r, { desc: d }) => [d(r.updatedAt)],
    });

    if (!repo) return null;

    const octokit = getInstallationOctokit(org.githubInstallationId);
    const snippets = await fetchRepoSnippetsForTask(
      octokit,
      repo.owner,
      repo.name,
      featureTitle,
      featureRawRequest,
      6,
    );

    if (snippets.length === 0) return null;

    logger.info("prd_generation.repo_context_fetched", {
      repo: repo.fullName,
      snippetCount: snippets.length,
    });

    return {
      repoFullName: repo.fullName,
      relevantFiles: snippets,
    };
  } catch (error) {
    logger.warn("prd_generation.repo_context_failed", {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Step 1: OpenAI call — result is memoised by Inngest on retry. */
export async function runPrdAiStep(input: { featureId: string; workflowRunId: string }): Promise<PrdContent> {
  await updateWorkflowRun(input.workflowRunId, {
    status: "running",
    progress: 25,
    message: "Reading codebase context…",
  });

  const feature = await getFeatureRequest(input.featureId);
  await updateFeatureStatus(input.featureId, "prd_generating");

  // Fetch repo context in parallel — non-blocking, PRD generation proceeds regardless
  const repoContext = await fetchRepoContextForPrd(
    feature.organizationId,
    feature.title,
    feature.rawRequest,
  );

  await updateWorkflowRun(input.workflowRunId, {
    progress: 45,
    message: repoContext
      ? `Generating codebase-aware PRD (${repoContext.relevantFiles.length} files scanned)…`
      : "Generating structured PRD with AI…",
  });

  return generateFeaturePrd({
    title: feature.title,
    rawRequest: feature.rawRequest,
    repoContext: repoContext ?? undefined,
  });
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
