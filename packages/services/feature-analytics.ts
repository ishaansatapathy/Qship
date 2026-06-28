/**
 * Feature delivery analytics.
 *
 * Provides data-driven insights derived from the historical pipeline:
 * - Predictive delivery timeline based on project velocity
 * - Duplicate / similarity detection orchestration
 * - Pipeline health and bottleneck analysis
 */

import { eq, ne, and } from "@repo/database";
import db from "@repo/database";
import { featureRequests, aiReviews } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { ServiceError } from "./errors";
import { detectSimilarFeatureRequests, type SimilarityDetectionResult } from "./feature-ai";

// ── Predictive delivery timeline ───────────────────────────────────────────────

type StageEstimate = {
  stage: string;
  label: string;
  estimatedDays: number;
  confidence: "high" | "medium" | "low";
};

type DeliveryPrediction = {
  featureId: string;
  featureTitle: string;
  currentStatus: string;
  stages: StageEstimate[];
  totalRemainingDays: number;
  estimatedShipDate: Date;
  /** 0–100: based on number of historical samples used */
  overallConfidence: number;
  basisDescription: string;
  complexityMultiplier: number;
  historicalSampleCount: number;
};

const PIPELINE_STAGES = [
  { status: "submitted", label: "Triage" },
  { status: "triaging", label: "AI Triage" },
  { status: "awaiting_prd", label: "PRD Generation" },
  { status: "prd_ready", label: "Task Planning" },
  { status: "in_development", label: "Development" },
  { status: "code_review", label: "Code Review" },
  { status: "ai_review", label: "AI Review" },
  { status: "fix_needed", label: "Fix Iteration" },
  { status: "human_review", label: "Human Approval" },
  { status: "approved", label: "Release Prep" },
] as const;

const PRIORITY_MULTIPLIERS: Record<string, number> = {
  P0: 0.6,
  P1: 0.85,
  P2: 1.0,
  P3: 1.4,
};

const FALLBACK_STAGE_DAYS: Record<string, number> = {
  submitted: 0.1,
  triaging: 0.2,
  awaiting_prd: 0.3,
  prd_ready: 0.2,
  in_development: 3.0,
  code_review: 1.0,
  ai_review: 0.5,
  fix_needed: 1.5,
  human_review: 1.0,
  approved: 0.3,
};

/**
 * Predicts when a feature will ship based on:
 * 1. Historical average cycle times from shipped features in this project
 * 2. Current feature complexity (triage priority P0–P3)
 * 3. Number of AI review iterations already spent (indicates complexity)
 *
 * When < 3 historical samples exist, uses calibrated industry defaults
 * but marks confidence as "low".
 */
export async function predictDeliveryTimeline(
  featureId: string,
  projectId: string,
): Promise<DeliveryPrediction> {
  const [feature, shippedFeatures] = await Promise.all([
    db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, featureId),
      columns: { id: true, title: true, status: true, createdAt: true, metadata: true },
    }),
    db.query.featureRequests.findMany({
      where: and(
        eq(featureRequests.projectId, projectId),
        eq(featureRequests.status, "shipped"),
        ne(featureRequests.id, featureId),
      ),
      columns: { id: true, createdAt: true, updatedAt: true, metadata: true },
      orderBy: (f, { desc: d }) => [d(f.updatedAt)],
    }),
  ]);

  if (!feature) throw new ServiceError("NOT_FOUND", "Feature request not found");

  // Compute historical average total cycle time (createdAt → shipped)
  const totalCycleDays = shippedFeatures.map((f) => {
    const ms = f.updatedAt.getTime() - f.createdAt.getTime();
    return ms / (1000 * 60 * 60 * 24);
  });

  const sampleCount = totalCycleDays.length;
  const avgTotalDays =
    sampleCount >= 3
      ? totalCycleDays.reduce((a, b) => a + b, 0) / sampleCount
      : null;

  // Extract priority from triage metadata
  const triage = (feature.metadata as Record<string, unknown> | null)?.triage as
    | { priority?: string }
    | undefined;
  const priority = triage?.priority ?? "P2";
  const complexityMultiplier = PRIORITY_MULTIPLIERS[priority] ?? 1.0;

  // Get current review iteration count — more iterations = slower feature
  const reviewIterations = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureId),
    columns: { iteration: true },
  });
  const iterationPenalty = Math.max(1, reviewIterations.length) * 0.15;

  // Determine which stages are still ahead of the current status
  const currentStatusIndex = PIPELINE_STAGES.findIndex((s) => s.status === feature.status);
  const remainingStages = currentStatusIndex >= 0
    ? PIPELINE_STAGES.slice(currentStatusIndex + 1)
    : PIPELINE_STAGES;

  // Build per-stage estimates
  const stages: StageEstimate[] = remainingStages.map((s) => {
    const baseDays = FALLBACK_STAGE_DAYS[s.status] ?? 0.5;
    let adjustedDays: number;
    let confidence: "high" | "medium" | "low";

    if (avgTotalDays !== null && sampleCount >= 5) {
      // Scale stage by proportion of total — rough heuristic but data-backed
      const totalFallback = Object.values(FALLBACK_STAGE_DAYS).reduce((a, b) => a + b, 0);
      const stageProportion = baseDays / totalFallback;
      adjustedDays = avgTotalDays * stageProportion * complexityMultiplier;
      confidence = sampleCount >= 10 ? "high" : "medium";
    } else if (avgTotalDays !== null && sampleCount >= 3) {
      const totalFallback = Object.values(FALLBACK_STAGE_DAYS).reduce((a, b) => a + b, 0);
      const stageProportion = baseDays / totalFallback;
      adjustedDays = avgTotalDays * stageProportion * complexityMultiplier;
      confidence = "medium";
    } else {
      adjustedDays = baseDays * complexityMultiplier * (1 + iterationPenalty);
      confidence = "low";
    }

    return {
      stage: s.status,
      label: s.label,
      estimatedDays: Math.round(adjustedDays * 10) / 10,
      confidence,
    };
  });

  const totalRemainingDays = stages.reduce((sum, s) => sum + s.estimatedDays, 0);
  const estimatedShipDate = new Date(Date.now() + totalRemainingDays * 24 * 60 * 60 * 1000);

  const overallConfidence =
    sampleCount >= 10 ? 85 : sampleCount >= 5 ? 70 : sampleCount >= 3 ? 50 : 25;

  const basisDescription =
    sampleCount >= 3
      ? `Based on ${sampleCount} delivered feature${sampleCount === 1 ? "" : "s"} in this project (avg ${Math.round(avgTotalDays!)} days total cycle time). Priority ${priority} → ${complexityMultiplier}× complexity multiplier.`
      : `Insufficient historical data (${sampleCount} shipped feature${sampleCount === 1 ? "" : "s"}). Using calibrated baseline for a ${priority} feature. Confidence will improve as more features ship.`;

  logger.info("analytics.delivery_prediction", {
    featureId,
    totalRemainingDays,
    sampleCount,
    priority,
    overallConfidence,
  });

  return {
    featureId,
    featureTitle: feature.title,
    currentStatus: feature.status,
    stages,
    totalRemainingDays: Math.round(totalRemainingDays * 10) / 10,
    estimatedShipDate,
    overallConfidence,
    basisDescription,
    complexityMultiplier,
    historicalSampleCount: sampleCount,
  };
}

// ── Semantic duplicate check orchestration ─────────────────────────────────────

/**
 * Runs the semantic similarity check against all non-archived pipeline features.
 * Skips comparison against the feature itself, archived, and already-shipped features.
 */
export async function checkPipelineDuplicates(
  featureId: string,
  projectId: string,
): Promise<SimilarityDetectionResult> {
  const [feature, pipeline] = await Promise.all([
    db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, featureId),
      columns: { id: true, title: true, rawRequest: true },
    }),
    db.query.featureRequests.findMany({
      where: and(
        eq(featureRequests.projectId, projectId),
        ne(featureRequests.id, featureId),
      ),
      columns: { id: true, title: true, rawRequest: true, status: true },
    }),
  ]);

  if (!feature) throw new ServiceError("NOT_FOUND", "Feature not found");

  // Exclude terminal states — only compare against active pipeline
  const activePipeline = pipeline.filter(
    (f) =>
      !["shipped", "rejected", "archived", "duplicate_education"].includes(f.status),
  );

  if (activePipeline.length === 0) {
    return {
      hasSimilar: false,
      topCandidates: [],
      consolidationRecommendation: "No active pipeline features to compare against.",
    };
  }

  return detectSimilarFeatureRequests({
    title: feature.title,
    rawRequest: feature.rawRequest,
    existingFeatures: activePipeline,
  });
}

// ── Pipeline health overview ───────────────────────────────────────────────────

type StageBottleneck = {
  status: string;
  label: string;
  featureCount: number;
  percentOfPipeline: number;
};

type PipelineHealthSummary = {
  projectId: string;
  totalActive: number;
  byStatus: Record<string, number>;
  bottlenecks: StageBottleneck[];
  shippedLast30Days: number;
  avgCycleDaysLast30: number | null;
  healthLabel: "healthy" | "congested" | "stalled";
  insight: string;
};

/**
 * Analyses the entire project pipeline to surface bottlenecks and velocity trends.
 * Returns a health label and actionable insight.
 */
export async function getPipelineHealthSummary(projectId: string): Promise<PipelineHealthSummary> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const allFeatures = await db.query.featureRequests.findMany({
    where: eq(featureRequests.projectId, projectId),
    columns: { id: true, status: true, createdAt: true, updatedAt: true },
  });

  const activeFeatures = allFeatures.filter(
    (f) => !["shipped", "rejected", "archived"].includes(f.status),
  );

  const shippedRecent = allFeatures.filter(
    (f) => f.status === "shipped" && f.updatedAt >= thirtyDaysAgo,
  );

  const avgCycleDaysLast30 =
    shippedRecent.length > 0
      ? shippedRecent.reduce((sum, f) => {
          return sum + (f.updatedAt.getTime() - f.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        }, 0) / shippedRecent.length
      : null;

  const byStatus: Record<string, number> = {};
  for (const f of activeFeatures) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  }

  const bottlenecks: StageBottleneck[] = Object.entries(byStatus)
    .map(([status, count]) => {
      const label = PIPELINE_STAGES.find((s) => s.status === status)?.label ?? status;
      return {
        status,
        label,
        featureCount: count,
        percentOfPipeline:
          activeFeatures.length > 0 ? Math.round((count / activeFeatures.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.featureCount - a.featureCount)
    .slice(0, 3);

  const maxPercent = bottlenecks[0]?.percentOfPipeline ?? 0;
  const humanReviewCount = byStatus["human_review"] ?? 0;
  const fixNeededCount = byStatus["fix_needed"] ?? 0;

  let healthLabel: "healthy" | "congested" | "stalled" = "healthy";
  let insight = "";

  if (fixNeededCount + humanReviewCount > activeFeatures.length * 0.4) {
    healthLabel = "stalled";
    insight = `${fixNeededCount + humanReviewCount} of ${activeFeatures.length} active features are blocked in fix/review. Consider running batch AI re-reviews or scheduling a review session.`;
  } else if (maxPercent > 50) {
    healthLabel = "congested";
    insight = `${bottlenecks[0]?.label} has ${bottlenecks[0]?.featureCount} features (${maxPercent}% of pipeline). This stage is a bottleneck.`;
  } else {
    insight =
      activeFeatures.length === 0
        ? "No active features in the pipeline."
        : `Pipeline is flowing well. ${shippedRecent.length} features shipped in the last 30 days${avgCycleDaysLast30 ? ` at an average of ${Math.round(avgCycleDaysLast30)} days cycle time` : ""}.`;
  }

  return {
    projectId,
    totalActive: activeFeatures.length,
    byStatus,
    bottlenecks,
    shippedLast30Days: shippedRecent.length,
    avgCycleDaysLast30: avgCycleDaysLast30 ? Math.round(avgCycleDaysLast30 * 10) / 10 : null,
    healthLabel,
    insight,
  };
}
