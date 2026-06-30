import { and, eq } from "@repo/database";
import db from "@repo/database";
import { pullRequests, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "../errors";
import { appendFeatureActivity, getFeatureRequest, updateFeatureStatus } from "../feature-request";
import { getGithubAppConfig } from "./config";
import { getInstallationOctokit } from "./client";

// ── Branch / PR conventions ────────────────────────────────────────────────────

/** Canonical branch name used for ShipFlow-created PRs. */
export function branchNameForFeature(featureId: string): string {
  return `shipflow/${featureId}`;
}

/**
 * Builds a rich GitHub PR body that includes:
 * - Hidden machine-readable feature tag for webhook linking
 * - PRD acceptance criteria as a reviewable checklist
 * - Engineering task list for developer orientation
 * - AI review pipeline notice
 */
function buildPrBody(feature: {
  id: string;
  title: string;
  rawRequest: string;
  prd?: {
    content?: {
      goals?: string[];
      acceptanceCriteria?: string[];
      nonGoals?: string[];
    } | null;
  } | null;
  tasks?: { title: string }[];
}): string {
  const { appSlug } = getGithubAppConfig();
  const criteria = feature.prd?.content?.acceptanceCriteria ?? [];
  const tasks = feature.tasks ?? [];
  const goals = feature.prd?.content?.goals ?? [];

  const lines: string[] = [
    `<!-- Qship-Feature: ${feature.id} -->`,
    "",
    `## 🚀 Qship Feature: ${feature.title}`,
    "",
    "> This PR is managed by **Qship** — an automated delivery pipeline.",
    "",
    "---",
    "",
    "### 📋 What this PR delivers",
    "",
    // Show first 500 chars of the raw request to give context
    feature.rawRequest.length > 500
      ? `${feature.rawRequest.slice(0, 500)}…`
      : feature.rawRequest,
    "",
  ];

  if (goals.length) {
    lines.push("### 🎯 Goals", "", ...goals.map((g) => `- ${g}`), "");
  }

  if (criteria.length) {
    lines.push(
      "### ✅ Acceptance Criteria",
      "",
      "Check off each criterion before requesting human review:",
      "",
      ...criteria.map((c) => `- [ ] ${c}`),
      "",
    );
  }

  if (tasks.length) {
    lines.push(
      "### 🗂 Engineering Tasks",
      "",
      ...tasks.map((t) => `- [ ] ${t.title}`),
      "",
    );
  }

  lines.push(
    "---",
    "",
    "### 🤖 AI Review Pipeline",
    "",
    "Qship automatically reviews every push to this branch:",
    "",
    "1. **Diff analysis** — code is checked against acceptance criteria",
    "2. **Security scan** — blocking issues halt the review loop",
    "3. **Human gate** — once AI approves, a human reviewer is notified",
    "",
    "---",
    "",
    appSlug
      ? `_Opened by [Qship](https://github.com/apps/${appSlug})_`
      : "_Opened by Qship_",
  );

  return lines.join("\n");
}

// ── Commit message ─────────────────────────────────────────────────────────────

function scaffoldCommitMessage(feature: { id: string; title: string }): string {
  // Keep under 72 chars for the subject line (git best-practice)
  const maxTitle = 50;
  const short = feature.title.length > maxTitle
    ? `${feature.title.slice(0, maxTitle)}…`
    : feature.title;
  return `chore(shipflow): scaffold "${short}"\n\nFeature: ${feature.id}`;
}

// ── Scaffold file content ──────────────────────────────────────────────────────

function buildScaffoldDoc(feature: {
  id: string;
  title: string;
  rawRequest: string;
  prd?: {
    content?: {
      goals?: string[];
      acceptanceCriteria?: string[];
      edgeCases?: string[];
    } | null;
  } | null;
}): string {
  const content = feature.prd?.content;
  const lines = [
    `# ${feature.title}`,
    "",
    `> Feature ID: \`${feature.id}\``,
    "",
    "## Request",
    "",
    feature.rawRequest,
    "",
  ];

  if (content?.goals?.length) {
    lines.push("## Goals", "", ...content.goals.map((g) => `- ${g}`), "");
  }

  if (content?.acceptanceCriteria?.length) {
    lines.push(
      "## Acceptance Criteria",
      "",
      ...content.acceptanceCriteria.map((c) => `- [ ] ${c}`),
      "",
    );
  }

  if (content?.edgeCases?.length) {
    lines.push("## Edge Cases", "", ...content.edgeCases.map((e) => `- ${e}`), "");
  }

  return lines.join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────────

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
  const { owner, name: repo, defaultBranch } = repoRow;
  const branch = branchNameForFeature(feature.id);

  // ── Resolve base SHA ─────────────────────────────────────────────────────────
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner, repo, ref: `heads/${defaultBranch}`,
  });
  const baseSha = baseRef.object.sha;

  // ── Ensure branch exists ─────────────────────────────────────────────────────
  let branchExists = false;
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    branchExists = true;
    logger.info("github.pr.branch_already_exists", { owner, repo, branch });
  } catch {
    await octokit.rest.git.createRef({
      owner, repo, ref: `refs/heads/${branch}`, sha: baseSha,
    });
    logger.info("github.pr.branch_created", { owner, repo, branch });
  }

  // ── Scaffold spec file on new branches ───────────────────────────────────────
  if (!branchExists) {
    const docPath = `.shipflow/${feature.id}.md`;
    const docBody = buildScaffoldDoc(feature);
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: docPath,
      message: scaffoldCommitMessage(feature),
      content: Buffer.from(docBody, "utf8").toString("base64"),
      branch,
    });
    logger.info("github.pr.scaffold_committed", { owner, repo, branch, path: docPath });
  }

  // ── Create or find existing PR ────────────────────────────────────────────────
  const { data: existingPrs } = await octokit.rest.pulls.list({
    owner, repo,
    head: `${owner}:${branch}`,
    state: "all",
    per_page: 1,
  });

  let prNumber: number;
  let prUrl: string;
  let githubPrId: string;
  let headSha: string;

  if (existingPrs[0]) {
    prNumber = existingPrs[0].number;
    prUrl = existingPrs[0].html_url;
    githubPrId = String(existingPrs[0].id);
    headSha = existingPrs[0].head.sha;
    logger.info("github.pr.using_existing", { owner, repo, prNumber });
  } else {
    const body = buildPrBody(feature);
    const { data: created } = await octokit.rest.pulls.create({
      owner, repo,
      title: `feat(shipflow): ${feature.title}`,
      head: branch,
      base: defaultBranch,
      body,
    });
    prNumber = created.number;
    prUrl = created.html_url;
    githubPrId = String(created.id);
    headSha = created.head.sha;
    logger.info("github.pr.created", { owner, repo, prNumber, url: prUrl });
  }

  // ── Upsert pull request record ────────────────────────────────────────────────
  const prId = `${input.organizationId}-pr-${githubPrId}`;
  await db
    .insert(pullRequests)
    .values({
      id: prId,
      featureRequestId: feature.id,
      repositoryId: repoRow.id,
      githubPrNumber: prNumber,
      githubPrId,
      title: `feat(shipflow): ${feature.title}`,
      url: prUrl,
      headSha,
      baseBranch: defaultBranch,
      state: "open",
    })
    .onConflictDoUpdate({
      target: pullRequests.id,
      set: { url: prUrl, headSha, state: "open", updatedAt: new Date() },
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

