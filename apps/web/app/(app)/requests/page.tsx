"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  HelpCircle,
  ListTodo,
  Loader2,
  MessageSquare,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";
import { SkeletonList } from "~/components/app/skeleton-list";
import { StatSkeletonGrid } from "~/components/app/skeleton-panels";
import { FeatureDeliveryPanel } from "~/components/app/feature-delivery-panel";
import { WorkflowProgress } from "~/components/app/workflow-progress";
import { QshipConfirmDialog } from "~/components/app/qship-confirm-dialog";
import { buildTaskWalkthroughAgentUrl } from "~/lib/shipflow-focus";

type FeatureRow = RouterOutputs["feature"]["list"][number];
type FeatureDetail = RouterOutputs["feature"]["get"];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Clarifying",
  duplicate_education: "Already exists",
  prd_generating: "Generating PRD",
  prd_ready: "PRD ready",
  planning: "Planning",
  in_development: "In development",
  pr_open: "PR open",
  ai_review: "AI review",
  fix_needed: "Fixes needed",
  human_review: "Awaiting approval",
  approved: "Approved",
  shipped: "Shipped",
  rejected: "Rejected",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "var(--qship-text)",
  P1: "var(--qship-accent-bright)",
  P2: "var(--qship-accent)",
  P3: "var(--qship-dim)",
};

function getTriage(feature: FeatureRow | FeatureDetail) {
  const triage = feature.metadata?.triage as
    | {
        priority?: string;
        impactSummary?: string;
        category?: string;
        estimatedEffort?: string;
        recommendation?: string;
        clarifyingQuestions?: string[];
      }
    | undefined;
  return triage ?? null;
}

function PipelineStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="qship-req-stat">
      <span className="qship-req-stat-label">{label}</span>
      <span className="qship-req-stat-value">{value}</span>
    </div>
  );
}

function NewRequestModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [rawRequest, setRawRequest] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.feature.create.useMutation({
    onSuccess: async (row) => {
      await utils.feature.list.invalidate();
      await utils.feature.pipelineSummary.invalidate();
      toast.success("Request submitted — AI triage complete");
      onCreated(row.id);
      setTitle("");
      setRawRequest("");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!open) return null;

  return (
    <div className="qship-req-modal-backdrop" onClick={onClose} role="presentation">
      <div className="qship-req-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="qship-req-modal-head">
          <div>
            <h2>New feature request</h2>
            <p>Describe what you need — AI will triage priority and impact.</p>
          </div>
          <button type="button" className="qship-app-iconbtn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <label className="qship-req-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SSO for enterprise customers"
          />
        </label>

        <label className="qship-req-field">
          <span>What & why</span>
          <textarea
            value={rawRequest}
            onChange={(e) => setRawRequest(e.target.value)}
            rows={5}
            placeholder="Who needs this, what problem it solves, and any constraints…"
          />
        </label>

        <button
          type="button"
          className="qship-btn-accent qship-req-submit"
          disabled={create.isPending || title.trim().length < 3 || rawRequest.trim().length < 10}
          onClick={() =>
            create.mutate({
              title: title.trim(),
              rawRequest: rawRequest.trim(),
              runTriage: true,
            })
          }
        >
          {create.isPending ? (
            <>
              <Loader2 size={15} className="qship-spin" /> Analyzing with AI…
            </>
          ) : (
            <>
              <Sparkles size={15} /> Submit & triage
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function FeatureDetailPanel({
  featureId,
  onClose,
}: {
  featureId: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    loading?: boolean;
  } | null>(null);
  const [clarificationText, setClarificationText] = useState("");
  const detail = trpc.feature.get.useQuery({ id: featureId });
  const githubStatus = trpc.github.connectionStatus.useQuery({});
  const repos = trpc.github.listRepositories.useQuery({});
  const allReviews = trpc.feature.listReviews.useQuery({ id: featureId }, { staleTime: 10_000 });
  const reviewHealth = trpc.feature.getReviewLoopHealth.useQuery(
    { id: featureId },
    { enabled: allReviews.data != null && allReviews.data.length > 0, staleTime: 30_000 },
  );
  const reviewDelta = trpc.feature.getReviewDelta.useQuery(
    { id: featureId },
    { enabled: (allReviews.data?.length ?? 0) >= 2, staleTime: 30_000 },
  );
  const approvalBriefing = trpc.feature.getApprovalBriefing.useQuery(
    { id: featureId },
    {
      enabled: detail.data?.status === "human_review",
      staleTime: 60_000,
    },
  );

  const githubConnected = githubStatus.data?.connected === true;

  const invalidate = async () => {
    await utils.feature.get.invalidate({ id: featureId });
    await utils.feature.delivery.invalidate({ id: featureId });
    await utils.feature.list.invalidate();
    await utils.feature.pipelineSummary.invalidate();
  };

  const generatePrd = trpc.feature.generatePrd.useMutation({
    onSuccess: async () => {
      await invalidate();
      await utils.feature.listWorkflows.invalidate({ featureId });
      toast.success("PRD generation started — watch workflow progress below");
    },
    onError: (e) => toast.error(e.message),
  });

  const generateTasks = trpc.feature.generateTasks.useMutation({
    onSuccess: async () => {
      await invalidate();
      await utils.feature.listWorkflows.invalidate({ featureId });
      toast.success("Task generation started");
    },
    onError: (e) => toast.error(e.message),
  });

  const runAiReview = trpc.feature.runAiReview.useMutation({
    onSuccess: async () => {
      await invalidate();
      await utils.feature.listWorkflows.invalidate({ featureId });
      toast.success("AI review started");
    },
    onError: (e) => toast.error(e.message),
  });

  const createPr = trpc.feature.createPullRequest.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      toast.success(`PR #${result.number} opened`);
    },
    onError: (e) => toast.error(e.message),
  });

  const approve = trpc.feature.approve.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      const slack = result?.slack;
      if (slack?.sent) {
        toast.success(
          slack.simulated
            ? `Approved — Slack notification recorded for ${slack.channel ?? "#product-shipping"}`
            : `Approved — Slack notification delivered to ${slack.channel ?? "webhook"}`,
        );
      } else if (slack?.error) {
        toast.success("Approved for release");
        toast.error(`Slack delivery failed: ${slack.error}`);
      } else {
        toast.success("Approved for release");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const reject = trpc.feature.reject.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Changes requested — back to fix loop");
    },
    onError: (e) => toast.error(e.message),
  });

  const ship = trpc.feature.ship.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      const slack = result?.slack;
      if (slack?.sent) {
        toast.success(
          slack.simulated
            ? "Shipped — Slack shipped alert recorded on timeline"
            : "Shipped — Slack alert delivered",
        );
      } else {
        toast.success("Feature marked as shipped");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const advanceStatus = trpc.feature.updateStatus.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const addClarification = trpc.feature.addClarification.useMutation({
    onSuccess: async () => {
      await invalidate();
      setClarificationText("");
      toast.success("Clarification recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <aside className="qship-req-detail">
        <SkeletonList count={6} />
      </aside>
    );
  }

  if (!detail.data) return null;

  const feature = detail.data;
  const triage = getTriage(feature);
  const prd = feature.prd?.content;
  const tasks = feature.tasks ?? [];
  const linkedPr = feature.pullRequests?.[0];
  const reviews = allReviews.data ?? [];
  const _latestReview = reviews[0];
  const firstRepo = repos.data?.[0];
  const education = feature.metadata?.education as
    | {
        educationMessage?: string;
        existingCapabilitySummary?: string;
        matchedFeatureId?: string;
        matchedFeatureTitle?: string;
      }
    | undefined;

  return (
    <aside className="qship-req-detail">
      <div className="qship-req-detail-head">
        <button type="button" className="qship-app-iconbtn" onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
        <span className="qship-req-status-pill" data-accent={feature.status}>
          {STATUS_LABELS[feature.status] ?? feature.status}
        </span>
      </div>

      <h2 className="qship-req-detail-title">{feature.title}</h2>
      <p className="qship-req-detail-body">{feature.rawRequest}</p>

      {feature.status === "duplicate_education" && education ? (
        <section className="qship-req-triage" style={{ borderColor: "rgba(251, 191, 36, 0.35)" }}>
          <h3>
            <Sparkles size={14} /> Capability already exists
          </h3>
          <p>{education.educationMessage}</p>
          {education.existingCapabilitySummary ? (
            <p className="qship-req-rec">{education.existingCapabilitySummary}</p>
          ) : null}
          {education.matchedFeatureId ? (
            <Link href={`/requests?id=${education.matchedFeatureId}`} className="qship-btn-ghost" style={{ marginTop: 8, display: "inline-flex" }}>
              View existing: {education.matchedFeatureTitle ?? "Open feature"}
              <ArrowRight size={13} />
            </Link>
          ) : null}
        </section>
      ) : null}

      <FeatureDeliveryPanel featureId={feature.id} />

      <WorkflowProgress featureId={feature.id} />

      {triage ? (
        <section className="qship-req-triage">
          <h3>
            <Sparkles size={14} /> AI triage
          </h3>
          <div className="qship-req-triage-grid">
            {triage.priority ? (
              <span className="qship-req-priority" style={{ color: PRIORITY_COLORS[triage.priority] ?? "#fafafa" }}>
                {triage.priority}
              </span>
            ) : null}
            {triage.category ? <span className="qship-req-tag">{triage.category}</span> : null}
            {triage.estimatedEffort ? (
              <span className="qship-req-tag">Effort {triage.estimatedEffort}</span>
            ) : null}
          </div>
          {triage.impactSummary ? <p>{triage.impactSummary}</p> : null}
          {triage.recommendation ? <p className="qship-req-rec">{triage.recommendation}</p> : null}
          {triage.clarifyingQuestions?.length ? (
            <div className="qship-req-clarify">
              <h4><HelpCircle size={13} /> Clarifying questions</h4>
              <ul>
                {triage.clarifyingQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <div className="qship-req-clarify-input">
                <textarea
                  rows={3}
                  value={clarificationText}
                  onChange={(e) => setClarificationText(e.target.value)}
                  placeholder="Answer the questions above to help AI generate a better PRD…"
                />
                <button
                  type="button"
                  className="qship-btn-ghost"
                  disabled={addClarification.isPending || clarificationText.trim().length < 5}
                  onClick={() => addClarification.mutate({ id: feature.id, content: clarificationText.trim() })}
                >
                  {addClarification.isPending ? (
                    <><Loader2 size={13} className="qship-spin" /> Saving…</>
                  ) : (
                    <><MessageSquare size={13} /> Submit answer</>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="qship-req-actions">
        {!prd ? (
          <button
            type="button"
            className="qship-btn-accent"
            disabled={generatePrd.isPending}
            onClick={() =>
              setConfirm({
                title: "Generate PRD with AI?",
                description:
                  "ShipFlow will draft a product requirements document from this request. You can review it on the timeline before moving forward.",
                confirmLabel: "Generate PRD",
                onConfirm: () => {
                  setConfirm((prev) => (prev ? { ...prev, loading: true } : prev));
                  generatePrd.mutate(
                    { id: feature.id },
                    { onSettled: () => setConfirm(null) },
                  );
                },
              })
            }
          >
            {generatePrd.isPending ? (
              <>
                <Loader2 size={14} className="qship-spin" /> Generating PRD…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate PRD with AI
              </>
            )}
          </button>
        ) : tasks.length === 0 ? (
          <button
            type="button"
            className="qship-btn-accent"
            disabled={generateTasks.isPending}
            onClick={() => generateTasks.mutate({ id: feature.id })}
          >
            {generateTasks.isPending ? (
              <>
                <Loader2 size={14} className="qship-spin" /> Generating tasks…
              </>
            ) : (
              <>
                <ListTodo size={14} /> Generate engineering tasks
              </>
            )}
          </button>
        ) : null}

        {prd && tasks.length > 0 && !linkedPr && firstRepo ? (
          <button
            type="button"
            className="qship-btn-ghost"
            disabled={createPr.isPending}
            onClick={() => createPr.mutate({ id: feature.id, repositoryId: firstRepo.id })}
          >
            {createPr.isPending ? (
              <>
                <Loader2 size={14} className="qship-spin" /> Opening PR…
              </>
            ) : (
              <>
                <GitBranch size={14} /> Open GitHub PR
              </>
            )}
          </button>
        ) : null}

        {(linkedPr || prd) &&
        ["planning", "in_development", "pr_open", "fix_needed", "ai_review"].includes(feature.status) ? (
          <button
            type="button"
            className="qship-btn-ghost"
            disabled={runAiReview.isPending}
            onClick={() => runAiReview.mutate({ id: feature.id })}
          >
            {runAiReview.isPending ? (
              <>
                <Loader2 size={14} className="qship-spin" /> Reviewing…
              </>
            ) : (
              <>
                <ShieldCheck size={14} /> {feature.status === "fix_needed" ? "Re-run AI review" : "Run AI review"}
              </>
            )}
          </button>
        ) : null}

        {prd && feature.status === "prd_ready" ? (
          <button
            type="button"
            className="qship-btn-ghost"
            disabled={advanceStatus.isPending}
            onClick={() => advanceStatus.mutate({ id: feature.id, status: "planning" })}
          >
            Move to planning
          </button>
        ) : null}

        {feature.status === "human_review" ? (
          <>
            <button
              type="button"
              className="qship-btn-accent"
              disabled={approve.isPending}
              onClick={() => {
                const briefing = approvalBriefing.data;
                const desc = briefing
                  ? `AI recommends: ${briefing.approvalRecommendation.toUpperCase()} (confidence ${briefing.confidence}%). ${briefing.rationale}`
                  : "This feature passed AI review. Approving moves it to the release queue.";
                setConfirm({
                  title: "Approve for release?",
                  description: desc,
                  confirmLabel: "Approve",
                  onConfirm: () => {
                    setConfirm((prev) => (prev ? { ...prev, loading: true } : prev));
                    approve.mutate({ id: feature.id }, { onSettled: () => setConfirm(null) });
                  },
                });
              }}
            >
              <CheckCircle2 size={14} /> Approve for ship
            </button>
            <button
              type="button"
              className="qship-btn-ghost"
              disabled={reject.isPending}
              onClick={() => {
                setConfirm({
                  title: "Request changes?",
                  description: "This will move the feature back to the fix loop. The developer will need to address issues and re-run AI review.",
                  confirmLabel: "Request changes",
                  onConfirm: () => {
                    setConfirm((prev) => (prev ? { ...prev, loading: true } : prev));
                    reject.mutate({ id: feature.id, notes: "Changes requested" }, { onSettled: () => setConfirm(null) });
                  },
                });
              }}
            >
              Request changes
            </button>
          </>
        ) : null}

        {feature.status === "approved" ? (
          <button
            type="button"
            className="qship-btn-accent"
            disabled={ship.isPending}
            onClick={() =>
              setConfirm({
                title: "Mark as shipped?",
                description:
                  "This records the feature as live in production and updates pipeline analytics.",
                confirmLabel: "Mark shipped",
                onConfirm: () => {
                  setConfirm((prev) => (prev ? { ...prev, loading: true } : prev));
                  ship.mutate({ id: feature.id }, { onSettled: () => setConfirm(null) });
                },
              })
            }
          >
            <Rocket size={14} /> Mark shipped
          </button>
        ) : null}
      </div>

      {linkedPr ? (
        <section className="qship-req-prd">
          <h3>
            <GitBranch size={14} /> Pull request
          </h3>
          <a href={linkedPr.url} target="_blank" rel="noreferrer" className="qship-req-rec">
            #{linkedPr.githubPrNumber} {linkedPr.title} <ExternalLink size={12} />
          </a>
          {linkedPr.repository ? (
            <p style={{ fontSize: 12, opacity: 0.7 }}>{linkedPr.repository.fullName}</p>
          ) : null}
        </section>
      ) : null}

      {tasks.length ? (
        <section className="qship-req-prd">
          <h3>
            <ListTodo size={14} /> Engineering tasks ({tasks.length})
            <Link href="/tasks" className="qship-req-board-link">
              Open board
            </Link>
            <Link
              href={buildTaskWalkthroughAgentUrl({
                featureId: feature.id,
                taskId: tasks[0]?.id,
                taskIndex: 1,
                analyzeRepo: githubConnected,
              })}
              className="qship-req-board-link"
            >
              <Bot size={12} style={{ verticalAlign: -2 }} /> Walk with Agent
            </Link>
          </h3>
          <ul>
            {tasks.map((t, index) => (
              <li key={t.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                <span>
                  <strong>{t.title}</strong> · {t.status}
                </span>
                <Link
                  href={buildTaskWalkthroughAgentUrl({
                    featureId: feature.id,
                    taskId: t.id,
                    taskIndex: index + 1,
                    analyzeRepo: githubConnected,
                  })}
                  className="qship-req-board-link"
                  style={{ fontSize: 12 }}
                >
                  Explain in Agent
                </Link>
              </li>
            ))}
          </ul>
          {githubConnected ? (
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
              GitHub connected
              {repos.data?.[0]?.fullName ? ` (${repos.data[0].fullName})` : ""} — Agent compares tasks against your
              codebase and skips work you&apos;ve already done.
            </p>
          ) : (
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
              No repo linked — Agent gives plan-only pseudo-code. Connect GitHub in Settings for codebase-aware walkthrough.
            </p>
          )}
        </section>
      ) : null}

      {reviewHealth.data && (
        <section className="qship-req-prd">
          <h3>
            <ShieldCheck size={14} /> Review loop health
            <span
              className="qship-req-tag"
              style={{
                color:
                  reviewHealth.data.healthLabel === "healthy"
                    ? "var(--qship-accent-bright)"
                    : reviewHealth.data.healthLabel === "needs_attention"
                      ? "var(--qship-text)"
                      : "var(--qship-muted)",
                marginLeft: 8,
              }}
            >
              {reviewHealth.data.healthScore}/100 · {reviewHealth.data.healthLabel.replace("_", " ")}
            </span>
          </h3>
          <p style={{ fontSize: 13, opacity: 0.8 }}>{reviewHealth.data.summary}</p>
          {reviewHealth.data.cycleTimes?.slaStatus !== "ok" && (
            <p style={{ fontSize: 12, color: "var(--qship-accent-bright)" }}>
              ⚠ SLA {reviewHealth.data.cycleTimes.slaStatus} ·{" "}
              {reviewHealth.data.cycleTimes.waitingInHumanReviewHours}h waiting for approval
            </p>
          )}
        </section>
      )}

      {reviewDelta.data && (reviewDelta.data.resolved.length > 0 || reviewDelta.data.newIssues.length > 0) && (
        <section className="qship-req-prd">
          <h3>
            <ShieldCheck size={14} /> Review delta (latest vs previous)
          </h3>
          {reviewDelta.data.resolved.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--qship-accent-bright)" }}>
              ✓ {reviewDelta.data.resolved.length} issue{reviewDelta.data.resolved.length !== 1 ? "s" : ""} resolved
            </p>
          )}
          {reviewDelta.data.newIssues.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--qship-muted)" }}>
              ✗ {reviewDelta.data.newIssues.length} new issue{reviewDelta.data.newIssues.length !== 1 ? "s" : ""} introduced
            </p>
          )}
          {reviewDelta.data.persisting.length > 0 && (
            <p style={{ fontSize: 12, opacity: 0.7 }}>
              {reviewDelta.data.persisting.length} persisting unresolved
            </p>
          )}
        </section>
      )}

      {approvalBriefing.data && feature.status === "human_review" && (
        <section className="qship-req-prd">
          <h3>
            <CheckCircle2 size={14} /> AI approval briefing
            <span
              className="qship-req-tag"
              style={{
                color:
                  approvalBriefing.data.approvalRecommendation === "approve"
                    ? "var(--qship-accent-bright)"
                    : approvalBriefing.data.approvalRecommendation === "hold"
                      ? "var(--qship-text)"
                      : "var(--qship-muted)",
                marginLeft: 8,
              }}
            >
              {approvalBriefing.data.approvalRecommendation?.toUpperCase()} · {approvalBriefing.data.confidence}% confidence
            </span>
          </h3>
          <p style={{ fontSize: 13 }}>{approvalBriefing.data.summary}</p>
          {(approvalBriefing.data.keyThingsToVerify?.length ?? 0) > 0 && (
            <div style={{ marginTop: 6 }}>
              <strong style={{ fontSize: 12 }}>Verify before approving:</strong>
              <ul style={{ fontSize: 12, marginTop: 2 }}>
                {approvalBriefing.data.keyThingsToVerify.map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {reviewHealth.data && (
        <div
          className="qship-review-health-badge"
          data-label={reviewHealth.data.healthLabel}
          title={reviewHealth.data.summary}
        >
          <ShieldCheck size={12} />
          Review health: <strong>{reviewHealth.data.healthScore}/100</strong>
          <span className="qship-health-label">{reviewHealth.data.healthLabel.replace("_", " ")}</span>
          {reviewHealth.data.cycleTimes.slaStatus !== "ok" && (
            <span className="qship-health-sla" data-sla={reviewHealth.data.cycleTimes.slaStatus}>
              ⚠ SLA {reviewHealth.data.cycleTimes.slaStatus}
            </span>
          )}
        </div>
      )}

      {reviewDelta.data && (reviewDelta.data.resolved.length > 0 || reviewDelta.data.newIssues.length > 0) ? (
        <section className="qship-req-prd qship-review-delta">
          <h3>
            <ShieldCheck size={14} /> Review delta (iteration {reviewDelta.data.fromIteration} → {reviewDelta.data.toIteration})
          </h3>
          {reviewDelta.data.resolved.length > 0 && (
            <div className="qship-delta-group">
              <span className="qship-delta-badge resolved">✓ {reviewDelta.data.resolved.length} resolved</span>
              <ul>{reviewDelta.data.resolved.map((title, idx) => <li key={idx}>{title}</li>)}</ul>
            </div>
          )}
          {reviewDelta.data.newIssues.length > 0 && (
            <div className="qship-delta-group">
              <span className="qship-delta-badge new">+ {reviewDelta.data.newIssues.length} new</span>
              <ul>{reviewDelta.data.newIssues.map((title, idx) => <li key={idx}>{title}</li>)}</ul>
            </div>
          )}
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="qship-req-prd">
          <h3>
            <ShieldCheck size={14} /> AI review history · {reviews.length} iteration{reviews.length !== 1 ? "s" : ""}
          </h3>
          {reviews.map((review) => {
            const blocking = review.issues?.filter((i) => i.severity === "blocking") ?? [];
            const nonBlocking = review.issues?.filter((i) => i.severity !== "blocking") ?? [];
            const passed = review.readyForHuman === true;
            return (
              <div key={review.id} className="qship-review-iteration" data-pass={passed ? "true" : "false"}>
                <div className="qship-review-iteration-head">
                  <strong>Iteration {review.iteration}</strong>
                  <span className="qship-req-tag" style={{ color: passed ? "var(--qship-accent-bright)" : "var(--qship-text)" }}>
                    {passed ? "✓ Passed" : `✗ ${blocking.length} blocking`}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.5 }}>
                    {new Date(review.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ fontSize: 13, marginBottom: 6 }}>{review.summary}</p>
                {blocking.length > 0 ? (
                  <ul className="qship-review-issues">
                    {blocking.map((issue) => (
                      <li key={issue.id} data-severity="blocking">
                        <span className="qship-issue-badge blocking">BLOCKING</span>
                        <strong>{issue.title}</strong>
                        {issue.filePath ? <code style={{ fontSize: 11 }}> {issue.filePath}</code> : null}
                        <p style={{ fontSize: 12, opacity: 0.8 }}>{issue.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {nonBlocking.length > 0 ? (
                  <ul className="qship-review-issues">
                    {nonBlocking.map((issue) => (
                      <li key={issue.id} data-severity="non_blocking">
                        <span className="qship-issue-badge">ADVISORY</span>
                        <strong>{issue.title}</strong>
                        <p style={{ fontSize: 12, opacity: 0.8 }}>{issue.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {prd ? (
        <section className="qship-req-prd">
          <h3>Product requirements document</h3>
          <div className="qship-req-prd-block">
            <h4>Problem statement</h4>
            <p>{prd.problemStatement}</p>
          </div>
          {prd.goals?.length ? (
            <div className="qship-req-prd-block">
              <h4>Goals</h4>
              <ul>{prd.goals.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          ) : null}
          {prd.nonGoals?.length ? (
            <div className="qship-req-prd-block">
              <h4>Non-goals</h4>
              <ul>{prd.nonGoals.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          ) : null}
          {prd.userStories?.length ? (
            <div className="qship-req-prd-block">
              <h4>User stories</h4>
              <ul>{prd.userStories.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          ) : null}
          {prd.acceptanceCriteria?.length ? (
            <div className="qship-req-prd-block">
              <h4>Acceptance criteria</h4>
              <ul>{prd.acceptanceCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          ) : null}
          {prd.edgeCases?.length ? (
            <div className="qship-req-prd-block">
              <h4>Edge cases</h4>
              <ul>{prd.edgeCases.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : null}
          {prd.successMetrics?.length ? (
            <div className="qship-req-prd-block">
              <h4>Success metrics</h4>
              <ul>{prd.successMetrics.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <QshipConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel}
        loading={confirm?.loading}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm()}
      />
    </aside>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<SkeletonList count={5} />}>
      <RequestsPageContent />
    </Suspense>
  );
}

function RequestsPageContent() {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const workspace = trpc.feature.workspace.useQuery({});
  const summary = trpc.feature.pipelineSummary.useQuery({});
  const features = trpc.feature.list.useQuery({});

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  const sorted = useMemo(() => {
    const rows = features.data ?? [];
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...rows].sort((a, b) => {
      const pa = getTriage(a)?.priority ?? "P3";
      const pb = getTriage(b)?.priority ?? "P3";
      const diff =
        (priorityOrder[pa as keyof typeof priorityOrder] ?? 3) -
        (priorityOrder[pb as keyof typeof priorityOrder] ?? 3);
      if (diff !== 0) return diff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [features.data]);

  return (
    <div className="qship-req-page" data-detail={selectedId ? "open" : undefined}>
      <div className="qship-req-main">
        <header className="qship-req-header">
          <div>
            <h1>Feature Requests</h1>
            <p>
              {workspace.data?.projectName ?? "Workspace"} · Submit ideas, AI triages priority, generate PRDs in one click.
            </p>
          </div>
          <button type="button" className="qship-btn-accent" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> New request
          </button>
        </header>

        {summary.isLoading ? (
          <StatSkeletonGrid />
        ) : (
          <div className="qship-req-stats qship-content-reveal">
            <PipelineStat label="Total" value={summary.data?.total ?? 0} />
            <PipelineStat label="In delivery" value={summary.data?.inDelivery ?? 0} />
            <PipelineStat label="Needs attention" value={summary.data?.needsAttention ?? 0} />
            <PipelineStat label="Awaiting approval" value={summary.data?.awaitingApproval ?? 0} />
            <PipelineStat label="Shipped" value={summary.data?.shipped ?? 0} />
          </div>
        )}

        {features.isLoading ? (
          <SkeletonList count={5} />
        ) : sorted.length === 0 ? (
          <div className="qship-req-empty">
            <Rocket size={28} />
            <h2>No requests yet</h2>
            <p>Employees can submit product ideas here. AI scores priority and drafts PRDs.</p>
            <button type="button" className="qship-btn-accent" onClick={() => setModalOpen(true)}>
              Submit first request
            </button>
          </div>
        ) : (
          <ul className="qship-req-list">
            {sorted.map((feature) => {
              const triage = getTriage(feature);
              const active = selectedId === feature.id;
              return (
                <li key={feature.id}>
                  <button
                    type="button"
                    className="qship-req-row"
                    data-active={active}
                    onClick={() => setSelectedId(active ? null : feature.id)}
                  >
                    <div className="qship-req-row-top">
                      {triage?.priority ? (
                        <span
                          className="qship-req-priority"
                          style={{ color: PRIORITY_COLORS[triage.priority] ?? "#fafafa" }}
                        >
                          {triage.priority}
                        </span>
                      ) : (
                        <span className="qship-req-priority qship-req-priority-muted">—</span>
                      )}
                      <span className="qship-req-status-pill">{STATUS_LABELS[feature.status] ?? feature.status}</span>
                    </div>
                    <strong>{feature.title}</strong>
                    {triage?.impactSummary ? <p>{triage.impactSummary}</p> : <p>{feature.rawRequest.slice(0, 120)}…</p>}
                    <span className="qship-req-row-meta">
                      {triage?.category ?? "Uncategorized"} · Updated{" "}
                      {new Date(feature.updatedAt).toLocaleDateString()}
                      <ArrowRight size={13} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedId ? <FeatureDetailPanel featureId={selectedId} onClose={() => setSelectedId(null)} /> : null}

      <NewRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
