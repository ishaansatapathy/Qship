"use client";

import { useState } from "react";
import { Reveal } from "./qship-reveal";

const MODES = [
  { id: "pr", label: "PR review" },
  { id: "rules", label: "Rules system" },
  { id: "governance", label: "Governance" },
] as const;

export function QshipPrHighlight() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("pr");

  return (
    <section id="review" className="qship-shell qship-section" style={{ background: "var(--qship-surface)" }}>
      <div className="qship-frame" style={{ padding: "72px 32px" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 40 }}>
          <span className="qship-eyebrow">AI code review</span>
          <h2 className="qship-h2" style={{ marginTop: 14 }}>
            High-precision review on every change
          </h2>
          <p className="qship-lede" style={{ maxWidth: 520, marginInline: "auto" }}>
            Inspired by modern review platforms — ShipFlow agents reason over PRD, tasks, and codebase
            context to flag real issues before merge.
          </p>

          <div
            style={{
              marginTop: 28,
              display: "inline-flex",
              borderRadius: 999,
              border: "1px solid var(--qship-line)",
              background: "rgba(255,255,255,0.03)",
              padding: 4,
            }}
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  background: mode === m.id ? "var(--qship-accent)" : "transparent",
                  color: mode === m.id ? "#fff" : "var(--qship-muted)",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div
            className="qship-preview-window"
            style={{ maxWidth: 820, marginInline: "auto", boxShadow: "0 24px 60px -38px var(--qship-accent-glow)" }}
          >
            <div className="qship-preview-chrome">
              <div style={{ display: "flex", gap: 6 }}>
                {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  maxWidth: 340,
                  marginInline: "auto",
                  height: 24,
                  borderRadius: 5,
                  border: "1px solid var(--qship-line)",
                  background: "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 10px",
                  fontFamily: "var(--qship-mono)",
                  fontSize: 11,
                  color: "var(--qship-dim)",
                }}
              >
                github.com — Pull requests
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {mode === "pr" && (
                <>
                  <p style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>
                    feat: Implement user data export API for GDPR compliance
                  </p>
                  <p style={{ marginTop: 10, fontSize: 13, color: "var(--qship-muted)" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(34,197,94,0.4)",
                        background: "rgba(34,197,94,0.1)",
                        color: "#86efac",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Open
                    </span>
                    <span style={{ marginLeft: 8 }}>AddieCo wants to merge 2 commits into main</span>
                  </p>
                  <div
                    style={{
                      marginTop: 20,
                      borderRadius: 10,
                      border: "1px solid rgba(0,102,255,0.35)",
                      background: "rgba(0,102,255,0.06)",
                      padding: 16,
                    }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--qship-accent-bright)" }}>
                      shipflow-ai · review
                    </p>
                    <p style={{ marginTop: 8, fontWeight: 600 }}>Code review by ShipFlow</p>
                    <p style={{ marginTop: 6, fontSize: 13, color: "var(--qship-muted)" }}>
                      3 findings — 1 action required before human approval
                    </p>
                    <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 13, color: "var(--qship-muted)", lineHeight: 1.7 }}>
                      <li>Missing rate limit on export endpoint</li>
                      <li>Audit log not written on download path</li>
                      <li>PRD acceptance criterion #4 not covered in tests</li>
                    </ul>
                  </div>
                </>
              )}

              {mode === "rules" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    { rule: "No raw SQL in route handlers", status: "Pass" },
                    { rule: "All API routes must have rate limits", status: "Fail" },
                    { rule: "GDPR endpoints require audit logging", status: "Fail" },
                  ].map((r) => (
                    <div
                      key={r.rule}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 14px",
                        borderRadius: 8,
                        border: "1px solid var(--qship-line)",
                        fontSize: 13,
                      }}
                    >
                      <span>{r.rule}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: r.status === "Pass" ? "#86efac" : "var(--qship-accent-bright)",
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {mode === "governance" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {[
                    { title: "Risk intelligence", desc: "Track findings & resolution rates across teams." },
                    { title: "Audit trail", desc: "Every issue and approval logged for traceability." },
                    { title: "Human gate", desc: "Nothing ships until a reviewer signs off." },
                  ].map((card) => (
                    <div
                      key={card.title}
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        border: "1px solid var(--qship-line)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <p style={{ fontWeight: 600, fontSize: 14 }}>{card.title}</p>
                      <p style={{ marginTop: 6, fontSize: 12, color: "var(--qship-muted)", lineHeight: 1.6 }}>
                        {card.desc}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
