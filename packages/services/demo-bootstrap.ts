import { eq } from "@repo/database";
import db from "@repo/database";
import { aiReviews, featureRequests } from "@repo/database/schema";
import { logger } from "@repo/logger";

const BULK_EXPORT_TITLE = "Bulk export for compliance reports";
const BULK_EXPORT_SLACK_HINT =
  " Notify #product-shipping in Slack when approved for release.";

/** Ensures a passing AI review exists so the human approval gate is open in demo. */
export async function ensurePassingAiReview(featureRequestId: string): Promise<boolean> {
  const prior = await db.query.aiReviews.findMany({
    where: eq(aiReviews.featureRequestId, featureRequestId),
    columns: { iteration: true, readyForHuman: true },
    orderBy: (r, { desc: d }) => [d(r.createdAt)],
    limit: 1,
  });

  if (prior[0]?.readyForHuman) return false;

  const iteration = (prior[0]?.iteration ?? 0) + 1;
  await db.insert(aiReviews).values({
    id: crypto.randomUUID(),
    featureRequestId,
    iteration,
    summary: "All acceptance criteria met. No blocking issues.",
    readyForHuman: true,
    rawAnalysis: { pass: true, seeded: true },
  });

  return true;
}

async function ensureBulkExportSlackHint(): Promise<boolean> {
  const row = await db.query.featureRequests.findFirst({
    where: eq(featureRequests.title, BULK_EXPORT_TITLE),
    columns: { id: true, rawRequest: true },
  });
  if (!row || row.rawRequest.includes("#product-shipping")) return false;

  await db
    .update(featureRequests)
    .set({
      rawRequest: `${row.rawRequest.trim()}${BULK_EXPORT_SLACK_HINT}`,
      updatedAt: new Date(),
    })
    .where(eq(featureRequests.id, row.id));

  logger.info("demo.bootstrap.bulk_export_slack_hint", { featureId: row.id });
  return true;
}

/**
 * On API boot (demo mode), backfill passing AI reviews for human_review features
 * so judges can approve instantly without re-running seed.
 */
export async function ensureDemoWorkflowReady(): Promise<{ backfilled: number }> {
  if (process.env.DEMO_LOGIN_ENABLED !== "true") {
    return { backfilled: 0 };
  }

  await ensureBulkExportSlackHint();

  const rows = await db.query.featureRequests.findMany({
    where: eq(featureRequests.status, "human_review"),
    columns: { id: true, title: true },
  });

  let backfilled = 0;
  for (const row of rows) {
    const added = await ensurePassingAiReview(row.id);
    if (added) {
      backfilled += 1;
      logger.info("demo.bootstrap.ai_review_backfilled", {
        featureId: row.id,
        title: row.title,
      });
    }
  }

  if (backfilled > 0) {
    logger.info("demo.bootstrap.complete", { backfilled });
  }

  return { backfilled };
}
