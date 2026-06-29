import { ServiceError } from "../../errors";
import { addClarificationMessage } from "../../feature-request";
import { analyzeChangeRequest, generateApprovalBriefing } from "../../feature-ai";
import { dispatchAiReview } from "../../inngest/dispatch";
import {
  getLatestAiReview,
  getReviewDelta,
  getReviewLoopHealth,
  getReviewStats,
  listAiReviewsForFeature,
  listHumanApprovals,
  markFeatureShipped,
  recordHumanApproval,
  resolveReviewIssue,
  validateHumanApprovalEligibility,
} from "../../review";
import { assertReleaseReviewer } from "../../workflow-guards";

import type { ShipflowToolContext } from "../definitions";
import { loadAuthorizedFeature } from "../helpers";

export async function handle_run_ai_review(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const dispatch = await dispatchAiReview(id, userId);
        actions.push({
          kind: "ai_review",
          title: `AI review queued: ${feature.title}`,
          detail: dispatch.mode,
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({
          featureId: id,
          workflowRunId: dispatch.workflowRunId,
          mode: dispatch.mode,
          message: "AI review queued via workflow engine",
        });
}

export async function handle_request_human_review(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const note = String(args.note ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);

        try {
          await validateHumanApprovalEligibility(id);
        } catch (error) {
          const message = error instanceof ServiceError ? error.message : "Not eligible for human review";
          return JSON.stringify({ error: message, featureId: id, status: feature.status });
        }

        if (note) {
          await addClarificationMessage({
            featureRequestId: id,
            role: "agent",
            content: `Ready for human approval: ${note}`,
          });
        }

        actions.push({
          kind: "feature_detail",
          title: `Ready for approval: ${feature.title}`,
          detail: "human_review",
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({
          featureId: id,
          status: "human_review",
          eligible: true,
          message: "Feature passed AI review and is awaiting human approval",
        });
}

export async function handle_list_ai_reviews(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const reviews = await listAiReviewsForFeature(id);
        actions.push({
          kind: "ai_review",
          title: `AI reviews: ${feature.title}`,
          detail: `${reviews.length} iteration(s)`,
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({
          featureId: id,
          iterationCount: reviews.length,
          latestPass: reviews[0]?.readyForHuman ?? null,
          reviews: reviews.map((r) => ({
            id: r.id,
            iteration: r.iteration,
            pass: r.readyForHuman,
            summary: r.summary,
            blockingIssues: r.issues?.filter((i) => i.severity === "blocking").map((issue) => ({
              severity: issue.severity,
              title: issue.title,
              category: issue.category,
              filePath: issue.filePath,
            })),
            advisoryCount: r.issues?.filter((i) => i.severity !== "blocking").length ?? 0,
            createdAt: r.createdAt,
          })),
        });
}

export async function handle_get_review_delta(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId } = ctx;
  const id = String(args.id ?? "").trim();
        await loadAuthorizedFeature(userId, id);
        const delta = await getReviewDelta(id);
        if (!delta) {
          return JSON.stringify({ featureId: id, message: "Only one review iteration exists — no delta available yet" });
        }
        return JSON.stringify({ featureId: id, ...delta });
}

export async function handle_get_review_stats(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const stats = await getReviewStats(id);
        actions.push({
          kind: "ai_review",
          title: `Review health: ${feature.title}`,
          detail: `${stats.iterationCount} iteration(s) · ${stats.passRate}% pass rate`,
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({ featureId: id, ...stats });
}

export async function handle_approve_feature(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const notes = String(args.notes ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);

        await assertReleaseReviewer(userId, id);
        await validateHumanApprovalEligibility(id);

        const result = await recordHumanApproval({
          featureRequestId: id,
          reviewerUserId: userId,
          decision: "approved",
          notes: notes || undefined,
          skipEligibilityCheck: true,
        });
        actions.push({
          kind: "feature_detail",
          title: `Approved: ${feature.title}`,
          detail: "approved",
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({
          featureId: id,
          decision: result.decision,
          nextStatus: result.nextStatus,
          approvalId: result.id,
          slack: result.slack ?? null,
        });
}

export async function handle_ship_feature(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const result = await markFeatureShipped(id, userId);
        actions.push({
          kind: "feature_detail",
          title: `Shipped: ${feature.title}`,
          detail: result.release?.merge?.merged ? "PR merged" : "Released",
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({
          featureId: id,
          status: result.status,
          slack: result.slack ?? null,
          release: result.release,
        });
}

export async function handle_reject_feature(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const reason = String(args.reason ?? "").trim();
        if (!reason) return JSON.stringify({ error: "reason is required to reject a feature" });
        const { feature } = await loadAuthorizedFeature(userId, id);
        await assertReleaseReviewer(userId, id);
        const result = await recordHumanApproval({
          featureRequestId: id,
          reviewerUserId: userId,
          decision: "rejected",
          notes: reason,
        });
        actions.push({
          kind: "feature_detail",
          title: `Rejected: ${feature.title}`,
          detail: "rejected",
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({ featureId: id, decision: result.decision, nextStatus: result.nextStatus, approvalId: result.id });
}

export async function handle_request_changes(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const notes = String(args.notes ?? "").trim();
        if (!notes) return JSON.stringify({ error: "notes describing the required changes are required" });
        const { feature } = await loadAuthorizedFeature(userId, id);
        await assertReleaseReviewer(userId, id);
        const result = await recordHumanApproval({
          featureRequestId: id,
          reviewerUserId: userId,
          decision: "changes_requested",
          notes,
        });
        actions.push({
          kind: "feature_detail",
          title: `Changes requested: ${feature.title}`,
          detail: "fix_needed",
          href: `/requests?id=${id}`,
        });
        return JSON.stringify({ featureId: id, decision: result.decision, nextStatus: result.nextStatus, approvalId: result.id });
}

export async function handle_get_approval_history(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const approvals = await listHumanApprovals(id);
        return JSON.stringify({
          featureId: id,
          featureTitle: feature.title,
          approvalCount: approvals.length,
          approvals: approvals.map((a) => ({
            id: a.id,
            decision: a.decision,
            notes: a.notes,
            reviewerUserId: a.reviewerUserId,
            createdAt: a.createdAt,
          })),
        });
}

export async function handle_get_approval_briefing(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const { feature } = await loadAuthorizedFeature(userId, id);
        const [latestReview, delta, priorDecisions] = await Promise.all([
          getLatestAiReview(id),
          getReviewDelta(id),
          listHumanApprovals(id),
        ]);
        if (!latestReview) {
          return JSON.stringify({ error: "No AI review found. Run run_ai_review first." });
        }
        const issues = latestReview.issues as Array<{
          title: string; category: string; description: string; severity: string;
        }>;
        const briefing = await generateApprovalBriefing({
          featureTitle: feature.title,
          rawRequest: feature.rawRequest,
          prd: (feature.prd as { content: import("@repo/database/schema").PrdContent } | null)?.content ?? null,
          latestReview: {
            iteration: latestReview.iteration,
            summary: latestReview.summary,
            pass: latestReview.readyForHuman,
            blockingIssues: issues.filter((i) => i.severity === "blocking"),
            advisoryIssues: issues.filter((i) => i.severity !== "blocking"),
          },
          delta,
          priorDecisions: priorDecisions.map((d) => ({
            decision: d.decision,
            notes: d.notes,
            createdAt: d.createdAt,
          })),
        });
        actions.push({
          kind: "feature_detail",
          title: `Approval briefing: ${feature.title}`,
          detail: `${briefing.approvalRecommendation} (confidence: ${briefing.confidence}%)`,
          href: `/requests?id=${id}`,
          lines: [briefing.summary, briefing.rationale],
        });
        return JSON.stringify({ featureId: id, featureTitle: feature.title, ...briefing });
}

export async function handle_resolve_review_issue(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const issueId = String(args.issueId ?? "").trim();
        const resolved = Boolean(args.resolved);
        const notes = args.notes ? String(args.notes).trim() : undefined;
        if (!issueId) return JSON.stringify({ error: "issueId is required" });
        const result = await resolveReviewIssue(issueId, resolved, notes, userId);
        actions.push({
          kind: "feature_detail",
          title: resolved ? `Issue resolved: ${result.title}` : `Issue reopened: ${result.title}`,
          detail: notes ?? (resolved ? "marked resolved" : "reopened"),
        });
        return JSON.stringify(result);
}

export async function handle_analyze_change_request(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const id = String(args.id ?? "").trim();
        const notes = String(args.notes ?? "").trim();
        if (!notes) return JSON.stringify({ error: "notes are required" });
        const { feature } = await loadAuthorizedFeature(userId, id);
        const latestReview = await getLatestAiReview(id);
        const analysis = await analyzeChangeRequest({
          featureTitle: feature.title,
          changeRequestNotes: notes,
          latestReview: latestReview
            ? {
                summary: latestReview.summary,
                blockingIssues: (latestReview.issues as Array<{ title: string; category: string; severity: string }>)
                  .filter((i) => i.severity === "blocking")
                  .map((i) => ({ title: i.title, category: i.category })),
              }
            : null,
        });
        actions.push({
          kind: "feature_detail",
          title: `Change analysis: ${feature.title}`,
          detail: `${analysis.actionItems.length} action items (${analysis.totalBlockingEffort} effort)`,
          href: `/requests?id=${id}`,
          lines: [analysis.summary, `Next: ${analysis.nextStep}`],
        });
        return JSON.stringify({ featureId: id, featureTitle: feature.title, ...analysis });
}

export async function handle_get_review_loop_health(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId } = ctx;
  const id = String(args.id ?? "").trim();
  await loadAuthorizedFeature(userId, id);
  const health = await getReviewLoopHealth(id);
  return JSON.stringify(health);
}
