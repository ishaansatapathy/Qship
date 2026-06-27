"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  ListTodo,
  Loader2,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";
import { SkeletonList } from "~/components/app/skeleton-list";
import { FeatureDeliveryPanel } from "~/components/app/feature-delivery-panel";
import { WorkflowProgress } from "~/components/app/workflow-progress";

type FeatureRow = RouterOutputs["feature"]["list"][number];
type FeatureDetail = RouterOutputs["feature"]["get"];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Clarifying",
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
  P0: "#f87171",
  P1: "#fb923c",
  P2: "#fbbf24",
  P3: "#71717a",
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
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="qship-req-stat">
      <span className="qship-req-stat-label">{label}</span>
      <span className="qship-req-stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
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
  const detail = trpc.feature.get.useQuery({ id: featureId });
  const repos = trpc.github.listRepositories.useQuery({});

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
    onSuccess: async () => {
      await invalidate();
      toast.success("Approved for release");
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
    onSuccess: async () => {
      await invalidate();
      toast.success("Feature marked as shipped");
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
  const latestReview = feature.aiReviews?.[0];
  const firstRepo = repos.data?.[0];

  return (
    <aside className="qship-req-detail">
      <div className="qship-req-detail-head">
        <button type="button" className="qship-app-iconbtn" onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
        <span className="qship-req-status-pill">{STATUS_LABELS[feature.status] ?? feature.status}</span>
      </div>

      <h2 className="qship-req-detail-title">{feature.title}</h2>
      <p className="qship-req-detail-body">{feature.rawRequest}</p>

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
            <ul>
              {triage.clarifyingQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="qship-req-actions">
        {!prd ? (
          <button
            type="button"
            className="qship-btn-accent"
            disabled={generatePrd.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Generate a PRD with AI? You'll be able to review it on the timeline before moving forward.",
                )
              ) {
                return;
              }
              generatePrd.mutate({ id: feature.id });
            }}
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
                if (!window.confirm("Approve this feature for release?")) return;
                approve.mutate({ id: feature.id });
              }}
            >
              <CheckCircle2 size={14} /> Approve for ship
            </button>
            <button
              type="button"
              className="qship-btn-ghost"
              disabled={reject.isPending}
              onClick={() => reject.mutate({ id: feature.id, notes: "Changes requested from Requests UI" })}
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
            onClick={() => {
              if (!window.confirm("Mark this feature as shipped to production?")) return;
              ship.mutate({ id: feature.id });
            }}
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
          </h3>
          <ul>
            {tasks.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong> · {t.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {latestReview ? (
        <section className="qship-req-prd">
          <h3>
            <ShieldCheck size={14} /> AI review · iteration {latestReview.iteration}
          </h3>
          <p>{latestReview.summary}</p>
          {latestReview.issues?.length ? (
            <ul>
              {latestReview.issues.map((issue) => (
                <li key={issue.id}>
                  [{issue.severity}] {issue.title}
                  {issue.filePath ? ` · ${issue.filePath}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {prd ? (
        <section className="qship-req-prd">
          <h3>Product requirements</h3>
          <div className="qship-req-prd-block">
            <h4>Problem</h4>
            <p>{prd.problemStatement}</p>
          </div>
          {prd.goals?.length ? (
            <div className="qship-req-prd-block">
              <h4>Goals</h4>
              <ul>{prd.goals.map((g) => <li key={g}>{g}</li>)}</ul>
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
        </section>
      ) : null}
    </aside>
  );
}

export default function RequestsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const workspace = trpc.feature.workspace.useQuery({});
  const summary = trpc.feature.pipelineSummary.useQuery({});
  const features = trpc.feature.list.useQuery({});

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

        <div className="qship-req-stats">
          <PipelineStat label="Total" value={summary.data?.total ?? 0} />
          <PipelineStat label="In delivery" value={summary.data?.inDelivery ?? 0} accent="#38bdf8" />
          <PipelineStat
            label="Needs attention"
            value={summary.data?.needsAttention ?? 0}
            accent="#fbbf24"
          />
          <PipelineStat label="Awaiting approval" value={summary.data?.awaitingApproval ?? 0} accent="#fb923c" />
          <PipelineStat label="Shipped" value={summary.data?.shipped ?? 0} accent="#34d399" />
        </div>

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
