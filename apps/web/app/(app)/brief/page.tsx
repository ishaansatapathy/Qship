"use client";

import Link from "next/link";
import { useMemo } from "react";
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
} from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";
import { SkeletonList } from "~/components/app/skeleton-list";

type FeatureRow = RouterOutputs["feature"]["list"][number];

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

function greetingForHour() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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

export default function BriefPage() {
  const workspace = trpc.feature.workspace.useQuery({});
  const summary = trpc.feature.pipelineSummary.useQuery({});
  const features = trpc.feature.list.useQuery({});
  const github = trpc.github.connectionStatus.useQuery({});

  const needsAttention = useMemo(() => {
    const rows = features.data ?? [];
    const attentionStatuses = new Set([
      "submitted",
      "prd_ready",
      "human_review",
      "fix_needed",
      "ai_review",
    ]);
    return rows
      .filter((row) => attentionStatuses.has(row.status))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
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
        detail: "Link your repos so ShipFlow can track PRs, reviews, and releases.",
        href: "/settings",
        cta: "Connect GitHub",
      };
    }
    return {
      headline: "Submit your first feature request",
      detail: "ShipFlow tracks delivery from request → PRD → code → review → ship.",
      href: "/requests",
      cta: "New request",
    };
  }, [features.data, summary.data?.submitted, github.data?.connected]);

  const loading = workspace.isLoading || summary.isLoading || features.isLoading;

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
            disabled={loading}
            onClick={refreshAll}
          >
            {loading ? <Loader2 size={13} className="qship-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </header>

        {loading ? (
          <SkeletonList count={5} />
        ) : (
          <>
            <div className="qship-brief-hero">
              <p className="qship-brief-greeting">{greetingForHour()}</p>
              <p className="qship-brief-summary">
                {summary.data && summary.data.total > 0
                  ? `${summary.data.inDelivery} in delivery · ${summary.data.awaitingApproval} awaiting approval · ${summary.data.shipped} shipped`
                  : "Connect GitHub and submit feature requests to see your ShipFlow pipeline here."}
              </p>
            </div>

            <div className="qship-req-stats" style={{ marginBottom: 20 }}>
              <PipelineStat label="Total" value={summary.data?.total ?? 0} />
              <PipelineStat label="In delivery" value={summary.data?.inDelivery ?? 0} accent="#38bdf8" />
              <PipelineStat
                label="Needs attention"
                value={summary.data?.needsAttention ?? 0}
                accent="#fbbf24"
              />
              <PipelineStat
                label="Awaiting approval"
                value={summary.data?.awaitingApproval ?? 0}
                accent="#fb923c"
              />
              <PipelineStat label="Shipped" value={summary.data?.shipped ?? 0} accent="#34d399" />
            </div>

            <div className="qship-brief-focus-card">
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

            <section className="qship-brief-section">
              <div className="qship-brief-section-head">
                <Github size={14} />
                <h2>GitHub</h2>
              </div>
              <div className="qship-brief-section-body">
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
              </div>
            </section>

            <section className="qship-brief-section">
              <div className="qship-brief-section-head">
                <Sparkles size={14} />
                <h2>Needs attention</h2>
                {needsAttention.length > 0 ? (
                  <span className="qship-brief-badge">{needsAttention.length}</span>
                ) : null}
              </div>
              <div className="qship-brief-section-body">
                {needsAttention.length === 0 ? (
                  <div className="qship-app-empty" style={{ padding: "24px 0" }}>
                    <Rocket size={22} style={{ opacity: 0.35 }} />
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--qship-muted)" }}>
                      No open items — submit a feature request or ask the agent to triage your backlog.
                    </p>
                  </div>
                ) : (
                  <ul className="qship-req-list">
                    {needsAttention.map((feature: FeatureRow) => (
                      <li key={feature.id}>
                        <Link href="/requests" className="qship-req-row">
                          <div className="qship-req-row-top">
                            <span className="qship-req-status-pill">
                              {STATUS_LABELS[feature.status] ?? feature.status}
                            </span>
                          </div>
                          <strong>{feature.title}</strong>
                          <p>{feature.rawRequest.slice(0, 120)}{feature.rawRequest.length > 120 ? "…" : ""}</p>
                          <span className="qship-req-row-meta">
                            Updated {new Date(feature.updatedAt).toLocaleDateString()}
                            <ArrowRight size={13} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
