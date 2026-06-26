import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { organizations, pullRequests, repositories } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { runFeatureAiReview, runPrAiReview } from "../feature-ai";
import { getFeatureRequest, updateFeatureMetadata, updateFeatureStatus } from "../feature-request";
import { consumeAiReviewCredit, persistAiReview } from "../review";
import { getInstallationOctokit } from "./client";
import { fetchPullRequestDiff } from "./diff";

export async function runPullRequestAiReview(pullRequestId: string) {
  const prRow = await db.query.pullRequests.findFirst({
    where: eq(pullRequests.id, pullRequestId),
    with: { repository: true, featureRequest: { with: { prd: true, tasks: true } } },
  });
  if (!prRow?.repository) {
    return { ok: false as const, reason: "pr_not_found" as const };
  }

  const feature = prRow.featureRequest;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, feature.organizationId),
  });
  if (!org?.githubInstallationId) {
    return { ok: false as const, reason: "github_not_connected" as const };
  }

  await updateFeatureStatus(feature.id, "ai_review");

  try {
    await consumeAiReviewCredit(org.id);
  } catch {
    logger.warn("pr_review.skipped_no_credits", { featureId: feature.id });
  }

  const octokit = getInstallationOctokit(org.githubInstallationId);
  const diff = await fetchPullRequestDiff(
    octokit,
    prRow.repository.owner,
    prRow.repository.name,
    prRow.githubPrNumber,
  );

  const taskTitles = feature.tasks?.map((t) => t.title) ?? [];
  const review = await runPrAiReview({
    title: feature.title,
    rawRequest: feature.rawRequest,
    prd: feature.prd?.content ?? null,
    taskTitles,
    diffText: diff.diffText,
    prTitle: diff.title,
    changedFiles: diff.files.map((f) => f.filename),
  });

  const { reviewId, iteration, nextStatus } = await persistAiReview({
    featureRequestId: feature.id,
    pullRequestId: prRow.id,
    review,
    prd: feature.prd?.content ?? null,
  });

  await updateFeatureMetadata(feature.id, {
    lastAiReview: {
      at: new Date().toISOString(),
      pass: review.pass,
      summary: review.summary,
      findings: review.findings,
      iteration,
      reviewId,
      pullRequestId: prRow.id,
    },
  });

  try {
    const blocking = review.issues.filter((i) => i.severity === "blocking");
    const body = [
      `## ShipFlow AI Review (iteration ${iteration})`,
      "",
      review.summary,
      "",
      blocking.length
        ? `**Blocking (${blocking.length})**\n${blocking.map((i) => `- **${i.title}** (${i.filePath ?? "general"}): ${i.description}`).join("\n")}`
        : "_No blocking issues._",
      "",
      review.pass ? "✅ Ready for human approval." : "⚠️ Fixes needed before human review.",
    ].join("\n");

    await octokit.rest.issues.createComment({
      owner: prRow.repository.owner,
      repo: prRow.repository.name,
      issue_number: prRow.githubPrNumber,
      body,
    });
  } catch (error) {
    logger.warn("pr_review.github_comment_failed", {
      pullRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { ok: true as const, reviewId, iteration, nextStatus, pass: review.pass };
}

export async function runFeatureAiReviewWithOptionalPr(featureId: string, organizationId: string) {
  const feature = await getFeatureRequest(featureId);
  const prRow = await db.query.pullRequests.findFirst({
    where: eq(pullRequests.featureRequestId, featureId),
    orderBy: [desc(pullRequests.updatedAt)],
    with: { repository: true },
  });

  if (prRow?.repository) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    if (org?.githubInstallationId) {
      return runPullRequestAiReview(prRow.id);
    }
  }

  const review = await runFeatureAiReview({
    title: feature.title,
    rawRequest: feature.rawRequest,
    prd: feature.prd?.content ?? null,
    taskTitles: feature.tasks?.map((t) => t.title) ?? [],
  });

  const nextStatus = review.pass ? "human_review" : "fix_needed";
  await updateFeatureStatus(featureId, nextStatus);
  await updateFeatureMetadata(featureId, {
    lastAiReview: {
      at: new Date().toISOString(),
      pass: review.pass,
      summary: review.summary,
      findings: review.findings,
    },
  });

  return { ok: true as const, pass: review.pass, nextStatus, prLinked: false as const };
}
