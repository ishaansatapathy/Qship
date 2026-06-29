import { logger } from "@repo/logger";

import type { GeneratedCodeFile } from "../feature-codegen";
import { ServiceError } from "../errors";
import { getInstallationOctokit } from "./client";
import { branchNameForFeature } from "./pr";

export type CodeCommitResult = {
  branch: string;
  committedPaths: string[];
  headSha?: string;
};

/**
 * Ensures the feature branch exists and commits generated files in a single logical batch.
 */
export async function commitGeneratedFilesToFeatureBranch(input: {
  installationId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  featureId: string;
  featureTitle: string;
  files: GeneratedCodeFile[];
}): Promise<CodeCommitResult> {
  if (input.files.length === 0) {
    throw new ServiceError("PRECONDITION_FAILED", "No files to commit");
  }

  const octokit = getInstallationOctokit(input.installationId);
  const branch = branchNameForFeature(input.featureId);

  const { data: baseRef } = await octokit.rest.git.getRef({
    owner: input.owner,
    repo: input.repo,
    ref: `heads/${input.defaultBranch}`,
  });

  try {
    await octokit.rest.git.getRef({
      owner: input.owner,
      repo: input.repo,
      ref: `heads/${branch}`,
    });
  } catch {
    await octokit.rest.git.createRef({
      owner: input.owner,
      repo: input.repo,
      ref: `refs/heads/${branch}`,
      sha: baseRef.object.sha,
    });
    logger.info("code_commit.branch_created", { owner: input.owner, repo: input.repo, branch });
  }

  const committedPaths: string[] = [];
  let lastSha: string | undefined;

  for (const file of input.files) {
    let sha: string | undefined;
    try {
      const { data: existing } = await octokit.rest.repos.getContent({
        owner: input.owner,
        repo: input.repo,
        path: file.path,
        ref: branch,
      });
      if (!Array.isArray(existing) && "sha" in existing) {
        sha = existing.sha;
      }
    } catch {
      // New file
    }

    const shortTitle =
      input.featureTitle.length > 48 ? `${input.featureTitle.slice(0, 45)}…` : input.featureTitle;

    const { data: commitResult } = await octokit.rest.repos.createOrUpdateFileContents({
      owner: input.owner,
      repo: input.repo,
      path: file.path,
      message: `feat(shipflow): ${file.action} ${file.path}\n\n${file.summary}\n\nFeature: ${input.featureId} · ${shortTitle}`,
      content: Buffer.from(file.content, "utf8").toString("base64"),
      branch,
      sha,
    });

    committedPaths.push(file.path);
    lastSha = commitResult.commit.sha;
    logger.info("code_commit.file_committed", {
      featureId: input.featureId,
      path: file.path,
      action: file.action,
    });
  }

  return {
    branch,
    committedPaths,
    headSha: lastSha,
  };
}
