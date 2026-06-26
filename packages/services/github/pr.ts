import { and, eq } from "@repo/database";
import db from "@repo/database";
import { featureRequests, pullRequests, repositories } from "@repo/database/schema";

import { ServiceError } from "../errors";
import { appendFeatureActivity, getFeatureRequest, updateFeatureStatus } from "../feature-request";
import { getInstallationOctokit } from "./client";

function branchNameForFeature(featureId: string) {
  return `shipflow/${featureId}`;
}

function prBodyForFeature(featureId: string, title: string) {
  return [
    `ShipFlow-Feature: ${featureId}`,
    "",
    `## ${title}`,
    "",
    "_Opened by ShipFlow AI — link PR to feature delivery pipeline._",
  ].join("\n");
}

export async function createFeaturePullRequest(input: {
  organizationId: string;
  installationId: string;
  featureId: string;
  repositoryId: string;
}) {
  const feature = await getFeatureRequest(input.featureId);
  if (feature.organizationId !== input.organizationId) {
    throw new ServiceError("FORBIDDEN", "Feature is not in this organization");
  }

  const repoRow = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.id, input.repositoryId),
      eq(repositories.organizationId, input.organizationId),
    ),
  });
  if (!repoRow) {
    throw new ServiceError("NOT_FOUND", "Repository not found in workspace");
  }

  const octokit = getInstallationOctokit(input.installationId);
  const owner = repoRow.owner;
  const repo = repoRow.name;
  const branch = branchNameForFeature(feature.id);
  const defaultBranch = repoRow.defaultBranch;

  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const baseSha = baseRef.object.sha;

  let branchExists = false;
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    branchExists = true;
  } catch {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  }

  if (!branchExists) {
    const docPath = `.shipflow/${feature.id}.md`;
    const docBody = [
      `# ${feature.title}`,
      "",
      feature.rawRequest,
      "",
      feature.prd?.content?.goals?.length
        ? `## PRD goals\n${feature.prd.content.goals.map((g) => `- ${g}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: docPath,
      message: `shipflow: scaffold ${feature.title}`,
      content: Buffer.from(docBody, "utf8").toString("base64"),
      branch,
    });
  }

  let prNumber: number;
  let prUrl: string;
  let githubPrId: string;
  let headSha = baseSha;

  const { data: existing } = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${branch}`,
    state: "all",
    per_page: 1,
  });

  if (existing[0]) {
    prNumber = existing[0].number;
    prUrl = existing[0].html_url;
    githubPrId = String(existing[0].id);
    headSha = existing[0].head.sha;
  } else {
    const { data: created } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: `shipflow: ${feature.title}`,
      head: branch,
      base: defaultBranch,
      body: prBodyForFeature(feature.id, feature.title),
    });
    prNumber = created.number;
    prUrl = created.html_url;
    githubPrId = String(created.id);
    headSha = created.head.sha;
  }

  const prId = `${input.organizationId}-pr-${githubPrId}`;
  await db
    .insert(pullRequests)
    .values({
      id: prId,
      featureRequestId: feature.id,
      repositoryId: repoRow.id,
      githubPrNumber: prNumber,
      githubPrId,
      title: `shipflow: ${feature.title}`,
      url: prUrl,
      headSha,
      baseBranch: defaultBranch,
      state: "open",
    })
    .onConflictDoUpdate({
      target: pullRequests.id,
      set: {
        url: prUrl,
        headSha,
        state: "open",
        updatedAt: new Date(),
      },
    });

  await updateFeatureStatus(feature.id, "pr_open");
  await appendFeatureActivity(feature.id, {
    kind: "status",
    title: "Pull request opened",
    detail: `${repoRow.fullName} · #${prNumber}`,
    actor: "system",
  });

  return {
    pullRequestId: prId,
    url: prUrl,
    number: prNumber,
    branch,
    repositoryFullName: repoRow.fullName,
  };
}
