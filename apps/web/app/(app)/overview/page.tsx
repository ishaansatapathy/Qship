"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";

import { useBriefTitle } from "~/hooks/use-brief-title";
import { trpc } from "~/trpc/client";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  clarifying: "Clarifying",
  prd_generating: "Generating PRD",
  prd_ready: "PRD ready",
  planning: "Planning",
  plan_approved: "Plan approved",
  in_development: "In development",
  pr_open: "PR open",
  ai_review: "AI review",
  fix_needed: "Fixes needed",
  human_review: "Awaiting approval",
  approved: "Approved",
  shipped: "Shipped",
  rejected: "Rejected",
  duplicate_education: "Duplicate",
};

const URGENCY_CONFIG = {
  high: {
    border: "1px solid rgba(239,68,68,0.4)",
    bg: "rgba(239,68,68,0.06)",
    dot: "#ef4444",
    label: "Action required",
  },
  medium: {
    border: "1px solid rgba(234,179,8,0.4)",
    bg: "rgba(234,179,8,0.05)",
    dot: "#eab308",
    label: "Needs attention",
  },
  low: {
    border: "1px solid var(--qship-line)",
    bg: "transparent",
    dot: "var(--qship-dim)",
    label: "Low priority",
  },
} as const;

const HEALTH_CONFIG = {
  healthy: { color: "#22c55e", label: "Healthy" },
  congested: { color: "#eab308", label: "Congested" },
  stalled: { color: "#ef4444", label: "Stalled" },
} as const;

const STATUS_NEXT_PATH: Record<string, string> = {
  human_review: "/requests",
  fix_needed: "/requests",
  prd_ready: "/requests",
  submitted: "/requests",
  ai_review: "/requests",
};

export default function OverviewPage() {
  const router = useRouter();
  const timezoneOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);
  const clientBriefTitle = useBriefTitle();

  const overview = trpc.feature.pipelineOverview.useQuery(
    { timezoneOffsetMinutes },
    { refetchInterval: 60_000 },
  );

  const data = overview.data;
  const briefTitle = data?.briefTitle ?? clientBriefTitle;

  return (
    <div className="qship-brief-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="qship-brief-header">
        <div className="qship-brief-header-main">
          <h1>{briefTitle}</h1>
          <p>AI-generated pipeline summary — what needs you, what's moving, what's blocked.</p>
        </div>
        <button
          type="button"
          className="qship-btn-ghost"
          style={{ gap: 6, fontSize: 13 }}
          disabled={overview.isFetching}
          onClick={() => void overview.refetch()}
          title="Refresh brief"
        >
          <RefreshCw size={14} className={overview.isFetching ? "qship-spin" : undefined} />
          Refresh
        </button>
      </header>

      {/* ── AI brief card ──────────────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid rgba(0,102,255,0.25)",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 28,
          background: "rgba(0,102,255,0.04)",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          minHeight: 80,
        }}
      >
        <Sparkles size={18} color="var(--qship-accent-bright)" style={{ flexShrink: 0, marginTop: 2 }} />
        {overview.isLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--qship-dim)", fontSize: 14 }}>
            <Loader2 size={14} className="qship-spin" />
            Generating your pipeline brief…
          </div>
        ) : overview.isError ? (
          <p style={{ fontSize: 14, color: "var(--qship-dim)", margin: 0 }}>
            Could not generate brief — make sure the API is running.
          </p>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: "var(--qship-text)" }}>
            {data?.brief}
          </p>
        )}
      </div>

      {/* ── Pipeline snapshot ─────────────────────────────────────────────── */}
      {data && (
        <div className="qship-req-stats" style={{ marginBottom: 32 }}>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Active features</span>
            <span className="qship-req-stat-value">{data.totalActive}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Pipeline health</span>
            <span
              className="qship-req-stat-value"
              style={{ color: HEALTH_CONFIG[data.healthLabel]?.color }}
            >
              {HEALTH_CONFIG[data.healthLabel]?.label ?? data.healthLabel}
            </span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Shipped (30 days)</span>
            <span className="qship-req-stat-value">{data.shippedLast30Days}</span>
          </div>
          <div className="qship-req-stat">
            <span className="qship-req-stat-label">Action items</span>
            <span className="qship-req-stat-value">{data.actionItems.length}</span>
          </div>
        </div>
      )}

      {/* ── Action items ───────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "var(--qship-dim)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Items requiring your input
        </h2>

        {overview.isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="qship-req-row"
                style={{ height: 72, opacity: 0.5, animation: "qship-pulse 1.5s ease-in-out infinite" }}
              />
            ))}
          </div>
        ) : data?.actionItems.length === 0 ? (
          <div
            style={{
              border: "1px solid var(--qship-line)",
              borderRadius: 10,
              padding: "32px 24px",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={24} color="#22c55e" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>All clear</p>
            <p style={{ fontSize: 13, color: "var(--qship-dim)", margin: 0 }}>
              No action items right now. The pipeline is flowing well.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data?.actionItems.map((item) => {
              const cfg = URGENCY_CONFIG[item.urgency];
              const href = `${STATUS_NEXT_PATH[item.status] ?? "/requests"}?highlight=${item.featureId}`;
              return (
                <div
                  key={item.featureId}
                  className="qship-req-row"
                  style={{
                    border: cfg.border,
                    background: cfg.bg,
                    padding: "14px 18px",
                    cursor: "pointer",
                    gap: 14,
                  }}
                  onClick={() => router.push(href)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && router.push(href)}
                >
                  {/* urgency dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: cfg.dot,
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{item.featureTitle}</span>
                      <span
                        className="qship-req-status-pill"
                        style={{ fontSize: 11 }}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {item.staleDays !== undefined && item.staleDays > 0 && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 11,
                            color: "var(--qship-dim)",
                          }}
                        >
                          <Clock size={10} />
                          {item.staleDays}d
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--qship-dim)", margin: 0 }}>{item.reason}</p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--qship-accent-bright)", fontWeight: 500 }}>
                      {item.suggestedAction}
                    </span>
                    <ArrowRight size={13} color="var(--qship-accent-bright)" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Pipeline stage breakdown ───────────────────────────────────────── */}
      {data && Object.keys(data.byStatus).length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "var(--qship-dim)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Pipeline stages
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {Object.entries(data.byStatus)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([status, count]) => (
                <Link
                  key={status}
                  href={`/requests?status=${status}`}
                  className="qship-req-row"
                  style={{ flexDirection: "column", gap: 4, padding: "12px 16px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{count as number}</span>
                  <span style={{ fontSize: 11, color: "var(--qship-dim)" }}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* ── Quick links ────────────────────────────────────────────────────── */}
      <section style={{ marginTop: 36, paddingTop: 24, borderTop: "1px solid var(--qship-line)" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "var(--qship-dim)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Quick actions
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/requests" className="qship-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
            <Zap size={14} /> View all features
          </Link>
          <Link href="/agent" className="qship-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
            <Bot size={14} /> Ask the agent
          </Link>
          <Link href="/analytics" className="qship-btn-ghost" style={{ gap: 6, fontSize: 13 }}>
            <AlertTriangle size={14} /> Pipeline analytics
          </Link>
        </div>
      </section>

      {data && (
        <p style={{ marginTop: 24, fontSize: 11, color: "var(--qship-dim)" }}>
          Brief generated at {new Date(data.generatedAt).toLocaleTimeString()} · Refreshes every 60s
        </p>
      )}
    </div>
  );
}
