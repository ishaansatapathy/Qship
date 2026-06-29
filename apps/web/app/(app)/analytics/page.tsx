"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart2, Bot, CheckCircle2, Github, Rocket, Sparkles } from "lucide-react";

import { trpc } from "~/trpc/client";
import { SkeletonList } from "~/components/app/skeleton-list";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div
      className="qship-rotator-bubble"
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        padding: "16px 20px",
        minWidth: 130,
        flex: "1 1 130px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--qship-accent-bright)" }}>
        <Icon size={13} />
        <span style={{ fontSize: 11, fontFamily: "var(--qship-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: 28, fontWeight: 700, color: "var(--qship-text)", lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

export default function AnalyticsPage() {
  const summary = trpc.feature.pipelineSummary.useQuery({}, { staleTime: 60_000, refetchInterval: 60_000 });
  const observability = trpc.observability.summary.useQuery({}, { staleTime: 30_000, refetchInterval: 30_000 });
  const github = trpc.github.connectionStatus.useQuery({});

  const data = summary.data;
  const timeline = observability.data?.deliveryTimeline ?? [];

  return (
    <div className="qship-app-page">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 28 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart2 size={18} style={{ opacity: 0.7 }} />
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--qship-text)" }}>Analytics</h1>
          <span className="qship-mono-tag" style={{ marginLeft: "auto", fontSize: 11 }}>Delivery pipeline</span>
        </div>

        {summary.isLoading ? (
          <SkeletonList count={4} />
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard label="Total requests" value={data?.total ?? 0} icon={Rocket} />
            <StatCard label="In delivery" value={data?.inDelivery ?? 0} icon={Sparkles} />
            <StatCard label="Needs attention" value={data?.needsAttention ?? 0} icon={BarChart2} />
            <StatCard label="Awaiting approval" value={data?.awaitingApproval ?? 0} icon={CheckCircle2} />
            <StatCard label="Shipped" value={data?.shipped ?? 0} icon={CheckCircle2} />
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="qship-rotator-bubble" style={{ flex: "1 1 180px", padding: "12px 16px", gap: 6, flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--qship-muted)" }}>
              <Github size={12} />
              <span style={{ fontSize: 11, fontFamily: "var(--qship-mono)", textTransform: "uppercase" }}>GitHub</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--qship-text)" }}>
              {github.data?.connected
                ? `Connected${github.data.repositoryCount ? ` · ${github.data.repositoryCount} repos` : ""}${(observability.data?.pullRequests ?? 0) > 0 ? ` · ${observability.data?.pullRequests} PRs` : ""}`
                : "Not connected"}
            </span>
          </div>
          <div className="qship-rotator-bubble" style={{ flex: "1 1 180px", padding: "12px 16px", gap: 6, flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--qship-muted)" }}>
              <Bot size={12} />
              <span style={{ fontSize: 11, fontFamily: "var(--qship-mono)", textTransform: "uppercase" }}>Agent</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--qship-text)" }}>
              {observability.data?.mcpToolCalls ?? 0} tool calls · {observability.data?.agentSessions ?? 0} sessions
            </span>
          </div>
        </div>

        <div
          className="qship-rotator-bubble"
          style={{ flexDirection: "column", alignItems: "stretch", gap: 14, padding: "20px 20px 12px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CheckCircle2 size={13} style={{ opacity: 0.6 }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--qship-text)" }}>14-day delivery activity</span>
          </div>

          {observability.isLoading ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--qship-muted)", fontSize: 13 }}>
              Loading…
            </div>
          ) : timeline.length === 0 ? (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--qship-muted)", fontSize: 13 }}>
              No delivery updates yet — submit a feature request to start the pipeline.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                <defs>
                  <linearGradient id="colorQueued" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0066ff" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0066ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4d94ff" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4d94ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--qship-dim)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--qship-dim)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d0d0d",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--qship-text)",
                  }}
                  itemStyle={{ color: "var(--qship-muted)" }}
                />
                <Area
                  type="monotone"
                  dataKey="updates"
                  name="Pipeline updates"
                  stroke="#0066ff"
                  strokeWidth={1.5}
                  fill="url(#colorQueued)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="shipped"
                  name="Shipped / approved"
                  stroke="#4d94ff"
                  strokeWidth={1.5}
                  fill="url(#colorApproved)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {!summary.isLoading && (data?.total ?? 0) === 0 && (
          <div
            className="qship-rotator-bubble"
            style={{ justifyContent: "center", padding: "40px 24px", flexDirection: "column", alignItems: "center", gap: 8 }}
          >
            <Rocket size={20} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13, color: "var(--qship-muted)", textAlign: "center" }}>
              Submit feature requests to start tracking delivery metrics here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
