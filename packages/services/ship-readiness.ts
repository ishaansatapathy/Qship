import { desc, eq } from "@repo/database";
import db from "@repo/database";
import { aiReviews, aiReviewIssues } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { getFeatureRequest } from "./feature-request";

export type ReadinessItem = {
  id: string;
  label: string;
  pass: boolean | null;
  detail: string;
  severity: "blocker" | "warning" | "info";
};

export type ShipReadinessResult = {
  featureId: string;
  featureTitle: string;
  overallReady: boolean;
  score: number;
  scoreOutOf: number;
  items: ReadinessItem[];
  blockerCount: number;
  warningCount: number;
  recommendation: "approve" | "needs_fixes" | "not_reviewable";
  recommendationReason: string;
};

/**
 * Computes a deterministic Ship Readiness checklist for the human approval gate.
 * Aggregates data from the latest AI review, PRD, task board, and PR state
 * without making additional AI calls — results are immediate and auditable.
 *
 * Blockers prevent approval; warnings are advisory. The overall score is the
 * percentage of non-null checks that pass.
 */
export async function getShipReadiness(
  featureId: string,
  userId: string,
): Promise<ShipReadinessResult> {
  const feature = await getFeatureRequest(featureId);

  const latestReview = await db.query.aiReviews.findFirst({
    where: eq(aiReviews.featureRequestId, featureId),
    orderBy: [desc(aiReviews.createdAt)],
  });

  const openIssues = latestReview
    ? await db.query.aiReviewIssues.findMany({
        where: eq(aiReviewIssues.aiReviewId, latestReview.id),
      })
    : [];

  const prd = feature.prd?.content as Record<string, unknown> | null | undefined;
  const tasks = feature.tasks ?? [];
  const pullRequests = feature.pullRequests ?? [];
  const openPr = pullRequests.find((pr) => pr.state === "open") ?? pullRequests[0];

  const unresolvedBlocking = openIssues.filter(
    (i) => i.severity === "blocking" && !i.resolved,
  );
  const unresolvedNonBlocking = openIssues.filter(
    (i) => i.severity === "non_blocking" && !i.resolved,
  );
  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.status === "done");
  const hasPrLinked = pullRequests.length > 0;
  const prMergedOrOpen = hasPrLinked && (openPr?.state === "open" || openPr?.state === "merged");

  const reviewChecklistResults = (latestReview?.rawAnalysis as {
    checklistResults?: Array<{ dimension: string; pass: boolean; note: string }>;
  } | null)?.checklistResults ?? [];

  const getChecklistDimension = (dim: string) =>
    reviewChecklistResults.find(
      (r) => r.dimension.toLowerCase().includes(dim.toLowerCase()),
    );

  const securityCheck = getChecklistDimension("security");
  const testsCheck = getChecklistDimension("test");
  const perfCheck = getChecklistDimension("performance");

  const hasRollbackPlan = Boolean(
    prd && typeof prd["rollbackPlan"] === "string" && (prd["rollbackPlan"] as string).length > 20,
  );
  const hasAcceptanceCriteria = Array.isArray(prd?.["acceptanceCriteria"])
    ? (prd!["acceptanceCriteria"] as string[]).length > 0
    : false;

  const items: ReadinessItem[] = [
    // ── Blockers (must all pass for approval) ──────────────────────────────
    {
      id: "ai_review_run",
      label: "AI review has been run",
      pass: Boolean(latestReview),
      detail: latestReview
        ? `Review ran at ${latestReview.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
        : "No AI review found. Run the AI review from the PR panel.",
      severity: "blocker",
    },
    {
      id: "no_blocking_issues",
      label: "No unresolved blocking issues",
      pass: unresolvedBlocking.length === 0,
      detail:
        unresolvedBlocking.length === 0
          ? "All blocking issues resolved"
          : `${unresolvedBlocking.length} unresolved blocking issue(s): ${unresolvedBlocking.map((i) => i.title).join(", ")}`,
      severity: "blocker",
    },
    {
      id: "ai_review_pass",
      label: "AI review overall pass",
      pass: latestReview ? Boolean((latestReview.rawAnalysis as { pass?: boolean } | null)?.pass) : null,
      detail: latestReview
        ? `AI verdict: ${(latestReview.rawAnalysis as { pass?: boolean } | null)?.pass ? "PASS ✓" : "FAIL — re-review required"}`
        : "No review data",
      severity: "blocker",
    },
    {
      id: "pr_linked",
      label: "Pull request linked",
      pass: hasPrLinked,
      detail: hasPrLinked
        ? `PR #${openPr?.githubPrNumber ?? "?"} — ${openPr?.state}`
        : "No pull request has been linked to this feature.",
      severity: "blocker",
    },
    {
      id: "security_pass",
      label: "Security review passed",
      pass: securityCheck ? securityCheck.pass : null,
      detail: securityCheck?.note ?? "Security dimension not yet checked by AI review.",
      severity: "blocker",
    },

    // ── Warnings (advisory, do not block approval) ──────────────────────────
    {
      id: "tasks_complete",
      label: "All engineering tasks done",
      pass: allTasksDone,
      detail:
        tasks.length === 0
          ? "No tasks on the board — was the PRD converted to tasks?"
          : allTasksDone
            ? `All ${tasks.length} tasks completed`
            : `${tasks.filter((t) => t.status === "done").length}/${tasks.length} tasks completed`,
      severity: "warning",
    },
    {
      id: "tests_added",
      label: "Tests coverage verified",
      pass: testsCheck ? testsCheck.pass : null,
      detail: testsCheck?.note ?? "Test coverage dimension not available from latest review.",
      severity: "warning",
    },
    {
      id: "performance_pass",
      label: "Performance considerations reviewed",
      pass: perfCheck ? perfCheck.pass : null,
      detail: perfCheck?.note ?? "Performance dimension not available from latest review.",
      severity: "warning",
    },
    {
      id: "acceptance_criteria",
      label: "Acceptance criteria defined in PRD",
      pass: hasAcceptanceCriteria,
      detail: hasAcceptanceCriteria
        ? `${(prd!["acceptanceCriteria"] as string[]).length} acceptance criteria defined`
        : "No acceptance criteria found in PRD.",
      severity: "warning",
    },
    {
      id: "rollback_plan",
      label: "Rollback plan documented",
      pass: hasRollbackPlan,
      detail: hasRollbackPlan
        ? "Rollback plan documented in PRD"
        : "No rollback plan in PRD — add it to reduce release risk.",
      severity: "warning",
    },

    // ── Info (FYI only) ─────────────────────────────────────────────────────
    {
      id: "non_blocking_warnings",
      label: "Non-blocking issues resolved",
      pass: unresolvedNonBlocking.length === 0,
      detail:
        unresolvedNonBlocking.length === 0
          ? "No open non-blocking warnings"
          : `${unresolvedNonBlocking.length} advisory warning(s) still open`,
      severity: "info",
    },
    {
      id: "pr_open",
      label: "PR is open or merged",
      pass: prMergedOrOpen,
      detail: openPr
        ? `PR state: ${openPr.state}`
        : "No PR state information available.",
      severity: "info",
    },
  ];

  const blockers = items.filter((i) => i.severity === "blocker" && i.pass !== null);
  const blockerCount = blockers.filter((i) => i.pass === false).length;
  const warnings = items.filter((i) => i.severity === "warning" && i.pass !== null);
  const warningCount = warnings.filter((i) => i.pass === false).length;

  const scoreable = items.filter((i) => i.pass !== null);
  const passing = scoreable.filter((i) => i.pass === true).length;
  const score = scoreable.length > 0 ? Math.round((passing / scoreable.length) * 100) : 0;

  const overallReady = blockerCount === 0 && feature.status === "human_review";

  const inWrongStatus = feature.status !== "human_review";

  let recommendation: ShipReadinessResult["recommendation"];
  let recommendationReason: string;

  if (inWrongStatus) {
    recommendation = "not_reviewable";
    recommendationReason = `Feature is in "${feature.status}" status — must be in "human_review" before approval.`;
  } else if (blockerCount > 0) {
    recommendation = "needs_fixes";
    recommendationReason = `${blockerCount} blocker(s) must be resolved before shipping.`;
  } else if (warningCount >= 3) {
    recommendation = "needs_fixes";
    recommendationReason = `${warningCount} advisory warning(s) detected — consider resolving before shipping.`;
  } else {
    recommendation = "approve";
    recommendationReason = warningCount > 0
      ? `Ready to ship with ${warningCount} minor warning(s).`
      : "All checks passed. Feature is ready to ship.";
  }

  logger.info("ship_readiness.computed", {
    featureId,
    score,
    blockerCount,
    warningCount,
    recommendation,
  });

  return {
    featureId,
    featureTitle: feature.title,
    overallReady,
    score,
    scoreOutOf: 100,
    items,
    blockerCount,
    warningCount,
    recommendation,
    recommendationReason,
  };
}
