"use client";

import { useState } from "react";
import { QshipLogoMark } from "./qship-logo";

type FeatureTab = {
  id: string;
  label: string;
  dot: string;
  title: string;
  description: string;
  preview: "discovery" | "prd" | "tasks" | "review" | "ship";
};

const tabs: FeatureTab[] = [
  {
    id: "discovery",
    label: "Feature discovery",
    dot: "bg-teal-400",
    title: "AI clarifies before you build",
    description:
      "Qship educates on existing features, asks the right questions, and turns vague requests into clear scope.",
    preview: "discovery",
  },
  {
    id: "prd",
    label: "PRD generation",
    dot: "bg-white",
    title: "Structured PRDs from conversation",
    description:
      "Every approved request becomes a structured PRD your team can review, edit, and sign off on.",
    preview: "prd",
  },
  {
    id: "tasks",
    label: "Task planning",
    dot: "bg-[#0066FF]",
    title: "PRD → engineering tasks",
    description:
      "Kanban-ready tasks with acceptance criteria — no orphan tickets, no missing context.",
    preview: "tasks",
  },
  {
    id: "review",
    label: "Agentic issue finding",
    dot: "bg-yellow-400",
    title: "Focused, accurate reviews",
    description:
      "AI reviews PRs against PRD, tasks, security, and edge cases — with less noise than generic bots.",
    preview: "review",
  },
  {
    id: "ship",
    label: "Ship to production",
    dot: "bg-[#0066FF]",
    title: "The AI delivery & governance platform",
    description:
      "Human approval is the final gate. Nothing ships until a reviewer signs off.",
    preview: "ship",
  },
];

function PreviewPanel({ type }: { type: FeatureTab["preview"] }) {
  if (type === "discovery") {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.5)", padding: 12 }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--qship-dim)", margin: 0 }}>User</p>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--qship-text)", margin: 0 }}>Add export for user data — GDPR thing</p>
        </div>
        <div style={{ borderRadius: 8, border: "1px solid rgba(0,102,255,0.25)", background: "var(--qship-accent-soft)", padding: 12 }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--qship-accent-bright)", margin: 0 }}>Qship AI</p>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--qship-text)", margin: 0 }}>
            We already have account deletion. Do you need CSV/JSON export, audit logs, or both?
          </p>
        </div>
      </div>
    );
  }

  if (type === "prd") {
    return (
      <div style={{ padding: 20, fontFamily: "var(--qship-mono)", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {["## Overview", "- GDPR data export API", "- Rate limit: 1 req/user/hr", "## Acceptance", "- Audit log on download"].map(
          (line, i) => (
            <p key={i} style={{ margin: 0, color: line.startsWith("#") ? "var(--qship-text)" : "var(--qship-muted)" }}>
              {line}
            </p>
          ),
        )}
      </div>
    );
  }

  if (type === "tasks") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: 20, fontSize: 11 }}>
        {["Backlog", "In progress", "Done"].map((col, i) => (
          <div key={col} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)", padding: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--qship-dim)", margin: 0 }}>{col}</p>
            {i === 1 && (
              <div style={{ marginTop: 8, borderRadius: 6, border: "1px solid rgba(0,102,255,0.3)", background: "var(--qship-accent-soft)", padding: 8, color: "var(--qship-text)" }}>
                Export API endpoint
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (type === "review") {
    return (
      <div style={{ padding: 20, fontSize: 13 }}>
        <p style={{ fontSize: 11, color: "var(--qship-dim)", margin: 0 }}>qship-ai · 2 min ago</p>
        <p style={{ marginTop: 4, fontWeight: 600, color: "var(--qship-text)", margin: 0 }}>Code review findings</p>
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <span style={{ borderRadius: 99, border: "1px solid rgba(255,255,255,0.08)", padding: "2px 8px", fontSize: 11, color: "var(--qship-muted)" }}>Bugs (2)</span>
          <span style={{ borderRadius: 99, border: "1px solid rgba(255,255,255,0.08)", padding: "2px 8px", fontSize: 11, color: "var(--qship-muted)" }}>Req gaps (1)</span>
        </div>
        <ul style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, padding: 0, listStyle: "none" }}>
          <li style={{ borderRadius: 8, border: "1px solid rgba(0,102,255,0.25)", background: "var(--qship-accent-soft)", padding: "8px 12px", color: "var(--qship-text)", fontSize: 12 }}>
            Race condition in concurrent export requests
          </li>
          <li style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", padding: "8px 12px", color: "var(--qship-muted)", fontSize: 12 }}>
            Missing audit log on download path
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", minHeight: 200, flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 20 }}>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          border: "1px solid rgba(0, 102, 255, 0.35)",
          background: "rgba(0, 102, 255, 0.08)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 8px 32px rgba(0, 102, 255, 0.2)",
        }}
      >
        <QshipLogoMark size={48} />
      </div>
      <p style={{ position: "absolute", bottom: 12, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--qship-accent-bright)", margin: 0 }}>
        Human approved · Shipped
      </p>
    </div>
  );
}

export function FeatureStack() {
  const [activeId, setActiveId] = useState("ship");
  const active = tabs.find((t) => t.id === activeId) ?? tabs[4]!;
  const activeIndex = tabs.findIndex((t) => t.id === activeId);

  return (
    <section className="qship-stack-section qship-section">
      <div className="qship-frame" style={{ position: "relative", padding: "80px 0" }}>
        <div style={{ textAlign: "center", padding: "0 32px 52px" }}>
          <span className="qship-eyebrow">The pipeline</span>
          <h2 className="qship-h2" style={{ marginTop: 16 }}>From request to production</h2>
          <p className="qship-lede" style={{ maxWidth: 460, marginInline: "auto" }}>
            See how Qship coordinates feature definition, task planning, pull request creation,
            AI reviews, and final human gates.
          </p>
        </div>

        <div style={{ position: "relative", maxWidth: 780, marginInline: "auto", paddingInline: 20 }}>
          {/* Stacked background card visuals to create folder deck depth */}
          <div className="qship-stack-deck">
            {tabs.map((tab, index) => {
              const isBehind = index < activeIndex;
              const offset = (activeIndex - index) * 12;
              if (index > activeIndex) return null;

              const dotColorClass = 
                tab.dot === "bg-teal-400" ? "qship-dot-teal" :
                tab.dot === "bg-white" ? "qship-dot-white" :
                tab.dot === "bg-yellow-400" ? "qship-dot-yellow" :
                "qship-dot-blue";

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  className="qship-stack-tab"
                  data-active={tab.id === activeId ? "true" : undefined}
                  style={{
                    top: `${index * 32}px`,
                    zIndex: index + 1,
                    transform: isBehind ? `scale(${0.98 - offset * 0.002})` : undefined,
                    opacity: tab.id === activeId ? 1 : 0.65 - (activeIndex - index) * 0.1,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`qship-stack-dot ${dotColorClass}`} />
                    {tab.label}
                  </span>
                  {tab.id === activeId && (
                    <span style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Active Stage
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Card Content */}
          <div
            className="qship-stack-card"
            style={{ marginTop: `${24 + activeIndex * 32}px` }}
          >
            <div className="qship-stack-card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`qship-stack-dot ${
                  active.dot === "bg-teal-400" ? "qship-dot-teal" :
                  active.dot === "bg-white" ? "qship-dot-white" :
                  active.dot === "bg-yellow-400" ? "qship-dot-yellow" :
                  "qship-dot-blue"
                }`} />
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--qship-text)" }}>
                  {active.label}
                </span>
              </span>
              <span style={{ fontSize: 11, fontFamily: "var(--qship-mono)", color: "var(--qship-dim)" }}>
                STAGE {activeIndex + 1} OF 5
              </span>
            </div>

            <div className="qship-stack-card-body">
              <div className="qship-stack-card-info">
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "var(--qship-text)", margin: 0 }}>
                  {active.title}
                </h3>
                <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.7, color: "var(--qship-muted)", margin: 0 }}>
                  {active.description}
                </p>
                <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
                  {tabs.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        border: "none",
                        background: t.id === activeId ? "var(--qship-accent-bright)" : "rgba(255,255,255,0.15)",
                        padding: 0,
                        cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                      aria-label={`Go to stage ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="qship-stack-card-preview">
                <PreviewPanel type={active.preview} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}