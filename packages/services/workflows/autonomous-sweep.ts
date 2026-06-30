/**
 * Autonomous pipeline sweep — runs on a cron schedule to advance features
 * that can be progressed without human input and surface those that cannot.
 *
 * Design principles:
 * - Never override human decisions (approved/rejected/shipped are final)
 * - Never dispatch expensive AI workflows (PRD/review) without user consent
 * - Only perform safe, additive actions: triage, duplicate-check, metadata updates
 * - All actions are logged with actor: "autonomous_agent" for audit trail
 */

import { and, eq, lte, ne } from "@repo/database";
import db from "@repo/database";
import { featureRequests, organizations } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { triageFeatureRequest } from "../feature-ai";
import { isOpenAiConfigured } from "../ai/openai";
import {
  appendFeatureActivity,
  getWorkspaceProjectForUser,
  updateFeatureMetadata,
} from "../feature-request";
import { checkPipelineDuplicates } from "../feature-analytics";

export type AutonomousSweepResult = {
  triaged: number;
  duplicatesFlagged: number;
  staleAlerted: number;
  totalInspected: number;
  ranAt: string;
};

const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const VERY_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Runs a non-destructive autonomous sweep across all organisations:
 * 1. Triages submitted features that haven't been triaged yet
 * 2. Runs semantic duplicate check on new features
 * 3. Appends stale-pipeline alerts to metadata for the UI to surface
 */
export async function runAutonomousPipelineSweep(): Promise<AutonomousSweepResult> {
  if (!isOpenAiConfigured()) {
    logger.info("autonomous_sweep.skipped", { reason: "openai_not_configured" });
    return { triaged: 0, duplicatesFlagged: 0, staleAlerted: 0, totalInspected: 0, ranAt: new Date().toISOString() };
  }

  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const veryStaleThreshold = new Date(Date.now() - VERY_STALE_THRESHOLD_MS);

  // Fetch all active non-terminal features across all projects
  const candidates = await db.query.featureRequests.findMany({
    where: and(
      ne(featureRequests.status, "shipped"),
      ne(featureRequests.status, "rejected"),
      ne(featureRequests.status, "duplicate_education"),
      ne(featureRequests.status, "approved"),
    ),
    columns: {
      id: true,
      title: true,
      rawRequest: true,
      status: true,
      projectId: true,
      organizationId: true,
      updatedAt: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: (f, { asc }) => [asc(f.updatedAt)],
    limit: 100,
  });

  let triaged = 0;
  let duplicatesFlagged = 0;
  let staleAlerted = 0;

  for (const feature of candidates) {
    try {
      const meta = (feature.metadata ?? {}) as Record<string, unknown>;

      // ── 1. Auto-triage features submitted but not yet triaged ──────────────
      if (feature.status === "submitted" && !meta.triage) {
        const triage = await triageFeatureRequest({
          title: feature.title,
          rawRequest: feature.rawRequest,
        });

        await updateFeatureMetadata(feature.id, {
          triage,
          autonomousTriageAt: new Date().toISOString(),
        });

        await appendFeatureActivity(feature.id, {
          kind: "triage",
          title: "Auto-triaged by autonomous agent",
          detail: `Priority ${triage.priority} · ${triage.estimatedEffort} effort`,
          actor: "agent",
        });

        triaged++;
        logger.info("autonomous_sweep.auto_triaged", { featureId: feature.id, priority: triage.priority });
      }

      // ── 2. Semantic duplicate scan on recently created features ───────────
      const ageMs = Date.now() - feature.createdAt.getTime();
      const alreadyDupChecked = Boolean(meta.semanticDuplicateCheck);

      if (!alreadyDupChecked && ageMs < VERY_STALE_THRESHOLD_MS) {
        const dupResult = await checkPipelineDuplicates(feature.id, feature.projectId);

        if (dupResult.hasSimilar && dupResult.topCandidates.length > 0) {
          await updateFeatureMetadata(feature.id, {
            semanticDuplicateCheck: {
              checkedAt: new Date().toISOString(),
              hasSimilar: true,
              topMatch: dupResult.topCandidates[0],
              recommendation: dupResult.consolidationRecommendation,
            },
          });

          await appendFeatureActivity(feature.id, {
            kind: "education",
            title: "Potential duplicate detected by autonomous agent",
            detail: dupResult.topCandidates[0]
              ? `Similar to: "${dupResult.topCandidates[0].title}"`
              : undefined,
            actor: "agent",
          });

          duplicatesFlagged++;
        } else {
          // Mark as checked even if no duplicate — avoids re-running every sweep
          await updateFeatureMetadata(feature.id, {
            semanticDuplicateCheck: { checkedAt: new Date().toISOString(), hasSimilar: false },
          });
        }
      }

      // ── 3. Stale pipeline alerts ───────────────────────────────────────────
      const isStale = feature.updatedAt <= staleThreshold;
      const isVeryStale = feature.updatedAt <= veryStaleThreshold;
      const lastStaleAlert = meta.lastStaleAlert as string | undefined;
      const hoursSinceAlert = lastStaleAlert
        ? (Date.now() - new Date(lastStaleAlert).getTime()) / (1000 * 60 * 60)
        : Infinity;

      // Only alert if: stale AND not recently alerted (within 24h)
      if (isStale && hoursSinceAlert > 24) {
        const stageName = feature.status.replace(/_/g, " ");
        await updateFeatureMetadata(feature.id, {
          lastStaleAlert: new Date().toISOString(),
          staleWarning: {
            detectedAt: new Date().toISOString(),
            daysSinceUpdate: Math.floor((Date.now() - feature.updatedAt.getTime()) / (1000 * 60 * 60 * 24)),
            severity: isVeryStale ? "high" : "medium",
          },
        });

        await appendFeatureActivity(feature.id, {
          kind: "submitted",
          title: isVeryStale ? "⚠️ Feature stalled — no activity for 7+ days" : "Feature inactive for 3+ days",
          detail: `Last stage: ${stageName}`,
          actor: "agent",
        });

        staleAlerted++;
      }
    } catch (error) {
      logger.warn("autonomous_sweep.feature_error", {
        featureId: feature.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result: AutonomousSweepResult = {
    triaged,
    duplicatesFlagged,
    staleAlerted,
    totalInspected: candidates.length,
    ranAt: new Date().toISOString(),
  };

  logger.info("autonomous_sweep.completed", result);
  return result;
}
