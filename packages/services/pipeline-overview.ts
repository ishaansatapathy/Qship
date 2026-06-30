/**
 * AI-powered pipeline overview — generates a natural-language morning brief
 * and surfaces actionable items that require human decision.
 *
 * Designed to be the first thing a PM sees on login: what needs attention,
 * what's ready to ship, and what the agent can handle autonomously.
 */

import { and, desc, eq, lte, ne } from "@repo/database";
import db from "@repo/database";
import { featureRequests, prds } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { createChatCompletion, isOpenAiConfigured } from "./ai/openai";
import { getPipelineHealthSummary } from "./feature-analytics";
import { getWorkspaceProjectForUser } from "./feature-request";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OverviewActionItem = {
  featureId: string;
  featureTitle: string;
  status: string;
  reason: string;
  urgency: "high" | "medium" | "low";
  suggestedAction: string;
  staleDays?: number;
};

export type PipelineOverviewResult = {
  brief: string;
  actionItems: OverviewActionItem[];
  healthLabel: "healthy" | "congested" | "stalled";
  healthInsight: string;
  byStatus: Record<string, number>;
  totalActive: number;
  shippedLast30Days: number;
  generatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Awaiting clarification",
  prd_generating: "Generating PRD",
  prd_ready: "PRD ready — planning needed",
  planning: "Planning",
  plan_approved: "Plan approved",
  in_development: "In development",
  pr_open: "PR open",
  ai_review: "Under AI review",
  fix_needed: "Fixes needed",
  human_review: "Awaiting human approval",
  approved: "Approved",
  shipped: "Shipped",
  rejected: "Rejected",
  duplicate_education: "Duplicate detected",
};

function staleDays(updatedAt: Date): number {
  return Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Core service ─────────────────────────────────────────────────────────────

/**
 * Builds the pipeline overview for a user's workspace.
 * Surfaces actionable items and generates an AI brief if OpenAI is configured.
 */
export async function getPipelineOverview(userId: string): Promise<PipelineOverviewResult> {
  const ws = await getWorkspaceProjectForUser(userId);
  if (!ws) {
    return emptyOverview();
  }

  const projectId = ws.project.id;
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [health, activeFeatures] = await Promise.all([
    getPipelineHealthSummary(projectId),
    db.query.featureRequests.findMany({
      where:       and(
        eq(featureRequests.projectId, projectId),
        ne(featureRequests.status, "shipped"),
        ne(featureRequests.status, "rejected"),
      ),
      orderBy: [desc(featureRequests.updatedAt)],
      columns: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
      limit: 50,
    }),
  ]);

  // ── Build action items ────────────────────────────────────────────────────────
  const actionItems: OverviewActionItem[] = [];

  for (const f of activeFeatures) {
    const days = staleDays(f.updatedAt);

    if (f.status === "human_review") {
      actionItems.push({
        featureId: f.id,
        featureTitle: f.title,
        status: f.status,
        reason: days > 1 ? `Waiting for your approval for ${days} day${days === 1 ? "" : "s"}` : "Ready for your approval",
        urgency: days > 3 ? "high" : "medium",
        suggestedAction: "Review & approve",
        staleDays: days,
      });
    } else if (f.status === "fix_needed" && days >= 1) {
      actionItems.push({
        featureId: f.id,
        featureTitle: f.title,
        status: f.status,
        reason: `Fixes needed — blocked for ${days} day${days === 1 ? "" : "s"}`,
        urgency: days > 3 ? "high" : "medium",
        suggestedAction: "Run AI re-review after fixes",
        staleDays: days,
      });
    } else if (f.status === "prd_ready") {
      actionItems.push({
        featureId: f.id,
        featureTitle: f.title,
        status: f.status,
        reason: "PRD complete — ready to plan engineering tasks",
        urgency: "medium",
        suggestedAction: "Generate tasks",
        staleDays: days,
      });
    } else if (f.status === "submitted" && days > 1) {
      actionItems.push({
        featureId: f.id,
        featureTitle: f.title,
        status: f.status,
        reason: `Submitted ${days} day${days === 1 ? "" : "s"} ago — not yet triaged`,
        urgency: days > 5 ? "high" : "low",
        suggestedAction: "Generate PRD",
        staleDays: days,
      });
    } else if (["clarifying", "prd_generating", "planning"].includes(f.status) && days > 3) {
      actionItems.push({
        featureId: f.id,
        featureTitle: f.title,
        status: f.status,
        reason: `Stale in "${STATUS_LABELS[f.status] ?? f.status}" for ${days} days`,
        urgency: days > 7 ? "high" : "low",
        suggestedAction: "Check workflow status",
        staleDays: days,
      });
    }
  }

  // Sort: high urgency first, then by staleDays desc
  actionItems.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uDiff !== 0) return uDiff;
    return (b.staleDays ?? 0) - (a.staleDays ?? 0);
  });

  // ── AI brief ─────────────────────────────────────────────────────────────────
  const brief = isOpenAiConfigured()
    ? await generateAiBrief({
        totalActive: health.totalActive,
        byStatus: health.byStatus,
        actionItems: actionItems.slice(0, 6),
        healthLabel: health.healthLabel,
        shippedLast30Days: health.shippedLast30Days,
        healthInsight: health.insight,
      })
    : buildFallbackBrief(health, actionItems);

  logger.info("pipeline_overview.generated", {
    userId,
    projectId,
    totalActive: health.totalActive,
    actionItemCount: actionItems.length,
    healthLabel: health.healthLabel,
  });

  return {
    brief,
    actionItems: actionItems.slice(0, 8),
    healthLabel: health.healthLabel,
    healthInsight: health.insight,
    byStatus: health.byStatus,
    totalActive: health.totalActive,
    shippedLast30Days: health.shippedLast30Days,
    generatedAt: new Date().toISOString(),
  };
}

// ── AI brief generation ───────────────────────────────────────────────────────

async function generateAiBrief(input: {
  totalActive: number;
  byStatus: Record<string, number>;
  actionItems: OverviewActionItem[];
  healthLabel: string;
  shippedLast30Days: number;
  healthInsight: string;
}): Promise<string> {
  const actionSummary = input.actionItems.length > 0
    ? input.actionItems
        .map((a) => `- "${a.featureTitle}" [${STATUS_LABELS[a.status] ?? a.status}]: ${a.reason}`)
        .join("\n")
    : "No immediate action items.";

  const byStatusText = Object.entries(input.byStatus)
    .map(([s, c]) => `${STATUS_LABELS[s] ?? s}: ${c}`)
    .join(", ");

  const prompt = `You are a product pipeline assistant. Generate a concise, professional morning briefing (3-5 sentences) for a PM based on the following pipeline state.

Pipeline health: ${input.healthLabel} — ${input.healthInsight}
Active features (${input.totalActive} total): ${byStatusText}
Shipped in last 30 days: ${input.shippedLast30Days}

Immediate action items:
${actionSummary}

Instructions:
- Be direct and actionable, not generic.
- Mention specific features by name if there are urgent items.
- If the pipeline is healthy, acknowledge it briefly and focus on what's next.
- If blocked, identify the specific bottleneck.
- Do NOT use bullet points — write flowing prose.
- Maximum 4 sentences.`;

  try {
    const response = await createChatCompletion(
      [{ role: "user", content: prompt }],
      { temperature: 0.4 },
    );
    return response.trim();
  } catch (error) {
    logger.warn("pipeline_overview.ai_brief_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackBrief(
      { totalActive: input.totalActive, healthLabel: input.healthLabel, insight: input.healthInsight, shippedLast30Days: input.shippedLast30Days },
      input.actionItems,
    );
  }
}

function buildFallbackBrief(
  health: { totalActive: number; healthLabel: string; insight: string; shippedLast30Days: number },
  actionItems: OverviewActionItem[],
): string {
  const high = actionItems.filter((a) => a.urgency === "high");
  if (high.length > 0) {
    return `${health.insight} You have ${high.length} high-urgency item${high.length === 1 ? "" : "s"} needing attention: ${high.map((a) => `"${a.featureTitle}"`).join(", ")}.`;
  }
  if (health.totalActive === 0) {
    return "Your pipeline is clear. Submit a new feature request to get started.";
  }
  return `${health.insight} ${actionItems.length > 0 ? `${actionItems.length} item${actionItems.length === 1 ? "" : "s"} waiting for your input.` : "Pipeline is moving smoothly."}`;
}

function emptyOverview(): PipelineOverviewResult {
  return {
    brief: "No workspace found. Set up your workspace to start tracking features.",
    actionItems: [],
    healthLabel: "healthy",
    healthInsight: "No active features in the pipeline.",
    byStatus: {},
    totalActive: 0,
    shippedLast30Days: 0,
    generatedAt: new Date().toISOString(),
  };
}
