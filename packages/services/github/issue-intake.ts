/**
 * GitHub Issues → Qship feature pipeline.
 *
 * When a new GitHub issue is opened on a repository linked to Qship, this
 * module converts it into a feature request and runs AI triage automatically.
 *
 * Label strategy:
 * - Issues labelled "qship-ignore" or "bug" are skipped.
 * - Imported issues are labelled "qship-imported" on GitHub (best-effort).
 * - The resulting Qship feature stores the GitHub issue URL and number in metadata.
 */

import { eq } from "@repo/database";
import db from "@repo/database";
import { organizations, organizationMembers, projects } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ingestFeatureRequest } from "../feature-intake";
import { getInstallationOctokit } from "./client";

type GithubIssuePayload = {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: { login: string } | null;
    labels: Array<{ name: string }>;
    state: string;
  };
  repository: {
    id: number;
    full_name: string;
    name: string;
    owner: { login: string };
  };
  installation?: { id: number } | null;
};

const SKIP_LABELS = new Set(["bug", "qship-ignore", "wontfix", "duplicate", "invalid"]);
const QSHIP_IMPORTED_LABEL = "qship-imported";

export type IssueIntakeResult =
  | { handled: true; featureId: string; educated: boolean }
  | { handled: false; reason: string };

/**
 * Processes a `issues.opened` GitHub webhook event.
 * Finds the linked Qship organisation via installation ID, then ingests the
 * issue as a feature request with source="api" and runs AI triage.
 */
export async function processGithubIssueWebhook(
  payload: GithubIssuePayload,
): Promise<IssueIntakeResult> {
  const { action, issue, repository, installation } = payload;

  if (action !== "opened") {
    return { handled: false, reason: `action_${action}_not_supported` };
  }

  if (issue.state !== "open") {
    return { handled: false, reason: "issue_not_open" };
  }

  // Skip issues with labels that indicate they're not feature requests
  const issueLabels = issue.labels.map((l) => l.name.toLowerCase());
  const shouldSkip = issueLabels.some((l) => SKIP_LABELS.has(l));
  if (shouldSkip) {
    logger.info("github.issue_intake.skipped_label", {
      repo: repository.full_name,
      issueNumber: issue.number,
      labels: issueLabels,
    });
    return { handled: false, reason: "skipped_by_label" };
  }

  const installationId = installation?.id;
  if (!installationId) {
    return { handled: false, reason: "no_installation_id" };
  }

  // Find the org linked to this installation
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.githubInstallationId, String(installationId)),
    columns: { id: true },
  });

  if (!org) {
    logger.info("github.issue_intake.org_not_found", { installationId, repo: repository.full_name });
    return { handled: false, reason: "org_not_linked" };
  }

  // Get the default project for this org
  const project = await db.query.projects.findFirst({
    where: eq(projects.organizationId, org.id),
    columns: { id: true },
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });

  if (!project) {
    return { handled: false, reason: "no_project_found" };
  }

  // Get the first owner/admin member to attribute the intake to
  const ownerMember = await db.query.organizationMembers.findFirst({
    where: eq(organizationMembers.organizationId, org.id),
    columns: { userId: true },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  // Build the feature request from the GitHub issue
  const rawRequest = [
    issue.body?.trim() || "(No description provided)",
    `\n\nSource: GitHub Issue #${issue.number} by @${issue.user?.login ?? "unknown"}`,
    `Repository: ${repository.full_name}`,
    `URL: ${issue.html_url}`,
  ].join("\n");

  const result = await ingestFeatureRequest({
    organizationId: org.id,
    projectId: project.id,
    title: issue.title.slice(0, 200),
    rawRequest,
    source: "api",
    createdByUserId: ownerMember?.userId,
    externalId: `github-issue-${repository.full_name}-${issue.number}`,
    channelMeta: {
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      githubRepo: repository.full_name,
      githubInstallationId: installationId,
      importedAt: new Date().toISOString(),
    },
    runTriage: true,
  });

  logger.info("github.issue_intake.created", {
    featureId: result.feature.id,
    repo: repository.full_name,
    issueNumber: issue.number,
    educated: result.educated,
  });

  // Label the GitHub issue as imported (best-effort — don't fail the intake)
  try {
    const octokit = getInstallationOctokit(String(installationId));
    await octokit.rest.issues.addLabels({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issue.number,
      labels: [QSHIP_IMPORTED_LABEL],
    });

    // Post a comment on the issue linking back to Qship
    const appUrl = process.env.BETTER_AUTH_URL ?? process.env.CLIENT_URL ?? "https://qship.dev";
    await octokit.rest.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issue.number,
      body: [
        "<!-- qship-intake-comment -->",
        "## 🚀 Imported to Qship",
        "",
        `This issue has been automatically imported as a feature request in your Qship workspace.`,
        result.educated
          ? `\n> **Note:** A similar feature may already exist in your pipeline. Check Qship for details.`
          : "",
        "",
        `[View in Qship](${appUrl}/requests) · AI triage running automatically`,
      ]
        .filter((l) => l !== "")
        .join("\n"),
    });
  } catch (commentError) {
    logger.warn("github.issue_intake.label_failed", {
      repo: repository.full_name,
      issueNumber: issue.number,
      error: commentError instanceof Error ? commentError.message : String(commentError),
    });
  }

  return { handled: true, featureId: result.feature.id, educated: result.educated };
}
