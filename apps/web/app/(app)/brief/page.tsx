"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Github,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  Sun,
  Target,
  X,
} from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";
import { greetingFromHour } from "@repo/services/pipeline-brief-time";
import { trpc } from "~/trpc/client";
import {
  AttentionCardSkeleton,
  BriefFocusSkeleton,
  StatSkeletonGrid,
} from "~/components/app/skeleton-panels";

type FeatureRow = RouterOutputs["feature"]["list"][number];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Clarifying",
  prd_generating: "Generating PRD",
  duplicate_education: "Already exists",
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

const STATUS_HINT: Record<string, string> = {
  submitted: "Open & generate PRD",
  prd_ready: "Review PRD",
  human_review: "Approve to ship",
  fix_needed: "Review fixes",
  ai_review: "View AI review",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "var(--qship-text)",
  P1: "var(--qship-accent-bright)",
  P2: "var(--qship-accent)",
  P3: "var(--qship-dim)",
};

function getTriage(feature: FeatureRow) {
  const triage = feature.metadata?.triage as
    | {
        priority?: string;
        category?: string;
        impactSummary?: string;
      }
    | undefined;
  return triage ?? null;
}

function dedupeByTitle(rows: FeatureRow[]) {
  const byTitle = new Map<string, FeatureRow>();
  for (const row of rows) {
    const key = row.title.trim().toLowerCase();
    const existing = byTitle.get(key);
    if (!existing || new Date(row.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byTitle.set(key, row);
    }
  }
  return Array.from(byTitle.values());
}

function relativeUpdated(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ONBOARD_KEY = "qship_onboarded_v1";

const ONBOARD_STEPS = [
  {
    icon: <Github size={16} />,
    title: "Connect GitHub",
    desc: "Install the Qship GitHub App to track PRs, reviews, and releases.",
    href: "/settings",
    cta: "Go to Settings",
  },
  {
    icon: <Sparkles size={16} />,
    title: "Submit a feature request",
    desc: "Describe what you want to build. Qship drafts the PRD and tasks automatically.",
    href: "/requests",
    cta: "New request",
  },
  {
    icon: <Bot size={16} />,
    title: "Chat with Qship Agent",
    desc: "Ask the agent to triage, plan, or review — it loops until the feature is ship-ready.",
    href: "/agent",
    cta: "Open Agent",
  },
];

function OnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="qship-content-reveal"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: 12,
        padding: "20px 20px 16px",
        marginBottom: 20,
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss onboarding"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--qship-dim)",
          padding: 2,
          display: "flex",
          alignItems: "center",
        }}
      >
        <X size={14} />
      </button>
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--qship-accent-bright)",
          marginBottom: 8,
        }}
      >
        Getting started
      </p>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "var(--qship-text)" }}>
        3 steps to your first shipped feature
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {ONBOARD_STEPS.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "12px 12px 10px",
              textDecoration: "none",
              display: "block",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                color: "var(--qship-accent-bright)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  background: "rgba(99,102,241,0.2)",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--qship-accent-bright)",
                }}
              >
                {i + 1}
              </span>
              {step.icon}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--qship-text)" }}>
                {step.title}
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--qship-dim)", lineHeight: 1.5, margin: 0 }}>
              {step.desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
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

export default function BriefPage() {
  const workspace = trpc.feature.workspace.useQuery({});
  const summary = trpc.feature.pipelineSummary.useQuery({});
  const features = trpc.feature.list.useQuery({});
  const github = trpc.github.connectionStatus.useQuery({});

  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setShowOnboarding(true);
    } catch {
      // private browsing — skip
    }
  }, []);

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  };

  const needsAttention = useMemo(() => {
    const rows = features.data ?? [];
    const attentionStatuses = new Set([
      "submitted",
      "prd_ready",
      "human_review",
      "fix_needed",
      "ai_review",
    ]);
    return dedupeByTitle(
      rows
        .filter((row) => attentionStatuses.has(row.status))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    ).slice(0, 5);
  }, [features.data]);

  const focus = useMemo(() => {
    const awaiting = (features.data ?? []).find((row) => row.status === "human_review");
    if (awaiting) {
      return {
        headline: `Approve release: ${awaiting.title}`,
        detail: "This feature passed AI review and needs your sign-off before ship.",
        href: "/requests",
        cta: "Review request",
      };
    }
    const prdReady = (features.data ?? []).find((row) => row.status === "prd_ready");
    if (prdReady) {
      return {
        headline: `Start delivery: ${prdReady.title}`,
        detail: "PRD is ready — move into planning or kick off implementation.",
        href: "/requests",
        cta: "Open request",
      };
    }
    if ((summary.data?.submitted ?? 0) > 0) {
      return {
        headline: "Triage new feature requests",
        detail: "Review submitted ideas and generate PRDs for the highest-impact work.",
        href: "/requests",
        cta: "Open requests",
      };
    }
    if (github.data?.connected !== true) {
      return {
        headline: "Connect GitHub",
        detail: "Link your repos so Qship can track PRs, reviews, and releases.",
        href: "/settings",
        cta: "Connect GitHub",
      };
    }
    return {
      headline: "Submit your first feature request",
      detail: "Qship tracks delivery from request → PRD → code → review → ship.",
      href: "/requests",
      cta: "New request",
    };
  }, [features.data, summary.data?.submitted, github.data?.connected]);

  const summaryLoading = summary.isLoading;
  const featuresLoading = features.isLoading;
  const githubLoading = github.isLoading;
  const refreshing = summary.isFetching || features.isFetching || github.isFetching;

  const refreshAll = () => {
    void workspace.refetch();
    void summary.refetch();
    void features.refetch();
    void github.refetch();
  };

  return (
    <div className="qship-app-page">
      <div className="qship-brief-page">
        <header className="qship-brief-header">
          <div className="qship-brief-header-main">
            <Sun size={18} style={{ opacity: 0.75 }} />
            <div>
              <h1>Pipeline overview</h1>
              <p>
                {workspace.data?.projectName ?? "Your workspace"} — what&apos;s moving and what needs you next.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="qship-btn-ghost"
            disabled={refreshing}
            onClick={refreshAll}
          >
            {refreshing ? <Loader2 size={13} className="qship-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </header>

        <div className="qship-brief-hero qship-content-reveal">
          <p className="qship-brief-greeting">{greetingFromHour(new Date().getHours())}</p>
          <p className="qship-brief-summary">
            {summaryLoading ? (
              <span className="qship-skeleton qship-brief-skeleton-inline" aria-hidden />
            ) : summary.data && summary.data.total > 0 ? (
              `${summary.data.inDelivery} in delivery · ${summary.data.awaitingApproval} awaiting approval · ${summary.data.shipped} shipped`
            ) : (
              "Connect GitHub and submit feature requests to see your Qship pipeline here."
            )}
          </p>
        </div>

        {showOnboarding && <OnboardingBanner onDismiss={dismissOnboarding} />}

        {summaryLoading ? (
          <StatSkeletonGrid />
        ) : (
          <div className="qship-req-stats qship-content-reveal" style={{ marginBottom: 20 }}>
            <PipelineStat label="Total" value={summary.data?.total ?? 0} />
            <PipelineStat label="In delivery" value={summary.data?.inDelivery ?? 0} />
            <PipelineStat label="Needs attention" value={needsAttention.length} />
            <PipelineStat label="Awaiting approval" value={summary.data?.awaitingApproval ?? 0} />
            <PipelineStat label="Shipped" value={summary.data?.shipped ?? 0} />
          </div>
        )}

        {summaryLoading || featuresLoading ? (
          <BriefFocusSkeleton />
        ) : (
          <div className="qship-brief-focus-card qship-content-reveal">
            <div className="qship-brief-focus-label">
              <Target size={14} />
              Today&apos;s focus
            </div>
            <h3>{focus.headline}</h3>
            <p>{focus.detail}</p>
            <div className="qship-brief-focus-actions">
              <Link href={focus.href} className="qship-btn-accent">
                {focus.cta}
              </Link>
              <Link
                href="/agent?prompt=Give+me+a+summary+of+our+feature+delivery+pipeline"
                className="qship-btn-ghost"
              >
                <Bot size={13} />
                Ask agent
              </Link>
            </div>
          </div>
        )}

        <section className="qship-brief-section qship-content-reveal">
          <div className="qship-brief-section-head">
            <Github size={14} />
            <h2>GitHub</h2>
          </div>
          <div className="qship-brief-section-body">
            {githubLoading ? (
              <div className="qship-rotator-bubble" style={{ padding: "14px 16px", width: "100%" }} aria-hidden>
                <span className="qship-skeleton qship-brief-skeleton-line" style={{ width: "60%" }} />
              </div>
            ) : (
              <div className="qship-rotator-bubble" style={{ padding: "14px 16px", width: "100%" }}>
                {github.data?.connected ? (
                  <span style={{ fontSize: 13, color: "var(--qship-muted)" }}>
                    Connected
                    {github.data.accountLogin ? ` as ${github.data.accountLogin}` : ""}
                    {github.data.repositoryCount
                      ? ` · ${github.data.repositoryCount} repo${github.data.repositoryCount === 1 ? "" : "s"} linked`
                      : ""}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--qship-muted)" }}>
                    Not connected — link GitHub in Settings to sync repos and PRs.
                  </span>
                )}
                <Link href="/settings" className="qship-btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }}>
                  {github.data?.connected ? "Manage" : "Connect"}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="qship-brief-section qship-brief-section--attention qship-content-reveal">
              <div className="qship-brief-section-head">
                <Sparkles size={14} />
                <h2>Needs attention</h2>
                {needsAttention.length > 0 ? (
                  <span className="qship-brief-badge">{needsAttention.length}</span>
                ) : null}
                {needsAttention.length > 0 ? (
                  <Link href="/requests" className="qship-brief-section-link">
                    View all
                    <ArrowRight size={12} />
                  </Link>
                ) : null}
              </div>
              <div className="qship-brief-section-body qship-brief-section-body--attention">
                {featuresLoading ? (
                  <div className="qship-brief-attention-stack">
                    <AttentionCardSkeleton />
                    <AttentionCardSkeleton />
                  </div>
                ) : needsAttention.length === 0 ? (
                  <div className="qship-app-empty" style={{ padding: "24px 0" }}>
                    <Rocket size={22} style={{ opacity: 0.35 }} />
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--qship-muted)" }}>
                      No open items — submit a feature request or ask the agent to triage your backlog.
                    </p>
                  </div>
                ) : (
                  <div className="qship-brief-attention-stack">
                    {needsAttention.map((feature: FeatureRow) => {
                      const triage = getTriage(feature);
                      const summary =
                        triage?.impactSummary?.trim() ||
                        feature.rawRequest.trim();

                      return (
                        <Link
                          key={feature.id}
                          href={`/requests?id=${encodeURIComponent(feature.id)}`}
                          className="qship-brief-attention-card"
                          data-status={feature.status}
                        >
                          <div className="qship-brief-attention-card-inner">
                            <div className="qship-brief-attention-card-head">
                              <span
                                className="qship-req-status-pill"
                                data-accent={feature.status}
                              >
                                {STATUS_LABELS[feature.status] ?? feature.status}
                              </span>
                              {triage?.priority ? (
                                <span
                                  className="qship-brief-attention-priority"
                                  style={{
                                    color: PRIORITY_COLORS[triage.priority] ?? "#fafafa",
                                  }}
                                >
                                  {triage.priority}
                                </span>
                              ) : null}
                              {triage?.category ? (
                                <span className="qship-brief-attention-category">
                                  {triage.category}
                                </span>
                              ) : null}
                              <span className="qship-brief-attention-time">
                                {relativeUpdated(feature.updatedAt)}
                              </span>
                            </div>
                            <h3 className="qship-brief-attention-title">{feature.title}</h3>
                            <p className="qship-brief-attention-desc">
                              {summary.slice(0, 140)}
                              {summary.length > 140 ? "…" : ""}
                            </p>
                            <span className="qship-brief-attention-cta">
                              {STATUS_HINT[feature.status] ?? "Open request"}
                              <ArrowRight size={13} />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
      </div>
    </div>
  );
}
