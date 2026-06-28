/**
 * Pure review-loop health scoring — extracted for unit testing without DB mocks.
 */

export type SlaStatus = "ok" | "at_risk" | "breach";

export type ReviewHealthScoreInput = {
  passRate: number;
  iterationCount: number;
  slaStatus: SlaStatus;
  allBlockingResolved: boolean;
  latestPass: boolean;
};

/** Computes a 0–100 health score for a feature's review loop. */
export function computeReviewHealthScore(params: ReviewHealthScoreInput): number {
  let score = 100;

  if (params.passRate < 50) score -= 30;
  else if (params.passRate < 75) score -= 15;

  if (params.iterationCount > 5) score -= 20;
  else if (params.iterationCount > 3) score -= 10;

  if (params.slaStatus === "breach") score -= 25;
  else if (params.slaStatus === "at_risk") score -= 10;

  if (!params.latestPass) score -= 15;
  if (!params.allBlockingResolved) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export function reviewHealthLabel(score: number): "healthy" | "needs_attention" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 50) return "needs_attention";
  return "critical";
}

export function computeSlaStatus(waitingInHumanReviewMs: number | null): SlaStatus {
  if (waitingInHumanReviewMs === null) return "ok";
  const hours = waitingInHumanReviewMs / (1000 * 60 * 60);
  if (hours > 48) return "breach";
  if (hours > 24) return "at_risk";
  return "ok";
}

export type ReviewHealthSummaryInput = {
  score: number;
  iterationCount: number;
  latestPass: boolean;
  averageIssuesPerIteration: number;
  slaStatus: SlaStatus;
  waitingInHumanReviewHours: number | null;
};

export function buildReviewHealthSummary(input: ReviewHealthSummaryInput): string {
  if (input.iterationCount === 0) return "No AI review has been run yet.";

  const parts: string[] = [
    `Health score: ${input.score}/100.`,
    `${input.iterationCount} review iteration${input.iterationCount === 1 ? "" : "s"}.`,
  ];

  if (input.latestPass) {
    parts.push("Latest review passed.");
  } else {
    parts.push(`Latest review failed — ${input.averageIssuesPerIteration} avg issues/iteration.`);
  }

  if (input.slaStatus === "breach") {
    parts.push(`⚠ SLA breach: waiting ${input.waitingInHumanReviewHours}h for human approval.`);
  } else if (input.slaStatus === "at_risk") {
    parts.push(`⚠ At risk: ${input.waitingInHumanReviewHours}h since AI approved.`);
  }

  return parts.join(" ");
}
