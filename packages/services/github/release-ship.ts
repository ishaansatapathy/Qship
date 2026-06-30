import { eq } from "@repo/database";
import db from "@repo/database";
import { pullRequests } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "../errors";
import { getFeatureRequest } from "../feature-request";
import { getInstallationOctokit } from "./client";
import { generateReleaseNotes } from "../feature-ai";
import { fetchPullRequestDiff } from "./diff";

export type FeatureReleaseResult = {
  merge: {
    attempted: boolean;
    merged: boolean;
    prNumber?: number;
    prUrl?: string;
    reason?: string;
  };
  deploy: {
    attempted: boolean;
    triggered: boolean;
    simulated: boolean;
    url?: string;
    reason?: string;
  };
};

/**
 * Merges the linked open PR (when GitHub is connected) and optionally triggers
 * a production deploy webhook before the feature is marked shipped.
 */
export async function executeFeatureRelease(input: {
  featureId: string;
  organizationId: string;
  installationId?: string | null;
}): Promise<FeatureReleaseResult> {
  const feature = await getFeatureRequest(input.featureId);
  const openPr =
    feature.pullRequests?.find((pr) => pr.state === "open") ?? feature.pullRequests?.[0];

  const merge: FeatureReleaseResult["merge"] = {
    attempted: false,
    merged: false,
    reason: openPr ? undefined : "no_linked_pr",
  };

  if (openPr && input.installationId && openPr.repository) {
    merge.attempted = true;
    try {
      const octokit = getInstallationOctokit(input.installationId);
      const { owner, name: repo } = openPr.repository;
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: openPr.githubPrNumber,
      });

      if (pr.merged) {
        merge.merged = true;
        merge.prNumber = openPr.githubPrNumber;
        merge.prUrl = openPr.url ?? pr.html_url;
        merge.reason = "already_merged";
      } else if (pr.state === "open") {
        const { data: merged } = await octokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: openPr.githubPrNumber,
          merge_method: "squash",
          commit_title: `feat(shipflow): ${feature.title}`,
        });

        if (merged.merged) {
          merge.merged = true;
          merge.prNumber = openPr.githubPrNumber;
          merge.prUrl = openPr.url ?? pr.html_url;
          await db
            .update(pullRequests)
            .set({ state: "merged", updatedAt: new Date() })
            .where(eq(pullRequests.id, openPr.id));
          logger.info("github.release.pr_merged", {
            featureId: input.featureId,
            prNumber: openPr.githubPrNumber,
          });
        } else {
          merge.reason = merged.message ?? "merge_failed";
        }
      } else {
        merge.reason = `pr_state_${pr.state}`;
      }
    } catch (error) {
      merge.reason = error instanceof Error ? error.message : "merge_error";
      logger.warn("github.release.merge_failed", {
        featureId: input.featureId,
        message: merge.reason,
      });
    }
  }

  const deploy: FeatureReleaseResult["deploy"] = {
    attempted: false,
    triggered: false,
    simulated: false,
  };

  const deployUrl = process.env.SHIP_DEPLOY_WEBHOOK_URL?.trim();
  if (deployUrl) {
    deploy.attempted = true;
    deploy.url = deployUrl;
    try {
      const response = await fetch(deployUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "feature.shipped",
          featureId: input.featureId,
          featureTitle: feature.title,
          organizationId: input.organizationId,
          prUrl: merge.prUrl ?? null,
          merged: merge.merged,
          shippedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new ServiceError(
          "INTERNAL",
          `Deploy webhook returned ${response.status}`,
        );
      }

      deploy.triggered = true;
      logger.info("github.release.deploy_triggered", { featureId: input.featureId });
    } catch (error) {
      deploy.reason = error instanceof Error ? error.message : "deploy_webhook_failed";
      logger.warn("github.release.deploy_failed", {
        featureId: input.featureId,
        message: deploy.reason,
      });
    }
  } else {
    deploy.simulated = true;
    deploy.reason = "SHIP_DEPLOY_WEBHOOK_URL not configured — merge-only release";
  }

  return { merge, deploy };
}

/**
 * Generates release notes from PRD + PR diff and creates a GitHub Release on
 * the merged PR's repository. Best-effort — never throws.
 *
 * Returns the release URL if successful, null otherwise.
 */
export async function createGithubReleaseForFeature(input: {
  featureId: string;
  installationId: string;
  prNumber: number;
  owner: string;
  repo: string;
  repoFullName: string;
}): Promise<{ releaseUrl: string; tagName: string; notes: object } | null> {
  try {
    const feature = await getFeatureRequest(input.featureId);
    const octokit = getInstallationOctokit(input.installationId);

    // Fetch diff for context (best-effort — proceed without if unavailable)
    let diffSummary = "";
    try {
      const diff = await fetchPullRequestDiff(octokit, input.owner, input.repo, input.prNumber);
      diffSummary = diff.files
        .map((f) => `${f.filename} (+${f.additions ?? 0}/-${f.deletions ?? 0})`)
        .join("\n");
    } catch {
      diffSummary = "Diff unavailable";
    }

    const notes = await generateReleaseNotes({
      featureTitle: feature.title,
      rawRequest: feature.rawRequest,
      prd: feature.prd?.content ?? null,
      diffSummary,
      prNumber: input.prNumber,
      repoFullName: input.repoFullName,
    });

    // Derive a unique tag — use feature id prefix if version is generic
    const tagName = notes.version.match(/v\d+\.\d+\.\d+/)
      ? notes.version
      : `qship-${input.featureId.slice(0, 8)}`;

    const { data: release } = await octokit.rest.repos.createRelease({
      owner: input.owner,
      repo: input.repo,
      tag_name: tagName,
      name: notes.title,
      body: notes.markdownBody,
      draft: false,
      prerelease: false,
    });

    logger.info("github.release.created", {
      featureId: input.featureId,
      releaseUrl: release.html_url,
      tagName,
    });

    return { releaseUrl: release.html_url, tagName, notes };
  } catch (error) {
    logger.warn("github.release.creation_failed", {
      featureId: input.featureId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
