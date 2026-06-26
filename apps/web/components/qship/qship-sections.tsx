"use client";

import { useState } from "react";
import {
  ChevronDown,
  Github,
  ListChecks,
  Search,
  Sparkles,
  Zap,
  Bot,
} from "lucide-react";
import { QshipLogoMark, QshipWordmark } from "./qship-logo";
import { Reveal } from "./qship-reveal";
import { QshipAgentDemo } from "./qship-agent-demo";

const MARQUEE = ["Next.js", "tRPC", "GitHub", "Inngest", "Drizzle", "PostgreSQL", "BetterAuth", "Razorpay", "AI SDK", "Vercel"];

const BENTO = [
  {
    title: "Requirement clarification",
    desc: "AI gathers missing context with follow-up questions before anything gets built.",
    visual: <Sparkles size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "PRD generation",
    desc: "Structured specs: problem, goals, user stories, acceptance criteria, edge cases.",
    visual: <ListChecks size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "Kanban task board",
    desc: "PRD → engineering tasks your team can review and approve for development.",
    visual: <Zap size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "GitHub integration",
    desc: "Connect repos, receive webhooks, track PRs, analyze diffs — no hardcoded data.",
    visual: <Github size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "AI QA review loop",
    desc: "Blocking vs non-blocking findings. Fix → re-review until release-ready.",
    visual: <Bot size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "Human approval gate",
    desc: "Verify PRD, tasks, PR, and review history before anything ships.",
    visual: <ListChecks size={18} color="#ff6b6f" />,
  },
  {
    title: "Multi-tenant workspaces",
    desc: "Organizations with projects, repos, billing, and usage limits per plan.",
    visual: <Search size={18} color="var(--qship-accent-bright)" />,
  },
  {
    title: "Async workflows",
    desc: "Inngest powers PRD gen, repo analysis, AI reviews, and release checks.",
    visual: <Zap size={18} color="var(--qship-accent-bright)" />,
  },
];

const CAPABILITIES = [
  { title: "Intake any request", desc: "Email, support tickets, calls, or in-app — all become structured feature requests." },
  { title: "Educate before build", desc: "If the capability already exists, the agent explains it instead of duplicating work." },
  { title: "PRD → tasks → code", desc: "Planning converts specs into kanban tasks; devs and agents implement via GitHub PRs." },
  { title: "Ship with confidence", desc: "AI reviews against the PRD; humans make the final release decision." },
];

const FAQS = [
  {
    q: "What is ShipFlow?",
    a: "ShipFlow is a multi-tenant SaaS for AI-assisted product delivery — from feature request through PRD, tasks, code review, and human-approved release.",
  },
  {
    q: "How does the core loop work?",
    a: "Feature Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship. The agent acts as QA and engineering reviewer, not just a syntax checker.",
  },
  {
    q: "Is GitHub integration real?",
    a: "Yes — Octokit connects repositories, receives webhooks, tracks pull requests, analyzes diffs, and posts AI review comments. Hardcoded PR data is not used.",
  },
  {
    q: "What stack powers ShipFlow?",
    a: "Next.js, tRPC monorepo, Shadcn UI, BetterAuth, Razorpay, Drizzle + PostgreSQL, Inngest, AI SDK, and Vercel — as required by ChaiCode.",
  },
];

export function QshipMarquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="qship-shell qship-section">
      <div className="qship-frame qship-marquee">
        <div className="qship-marquee-track">
          {items.map((label, i) => (
            <span key={`${label}-${i}`} className="qship-marquee-item">
              <Sparkles size={13} style={{ opacity: 0.35 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QshipIntegrations() {
  return (
    <section id="integrations" className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "72px 0 0" }}>
        <Reveal style={{ textAlign: "center", padding: "0 32px 48px" }}>
          <span className="qship-eyebrow">Integrations</span>
          <h2 className="qship-h2" style={{ marginTop: 16 }}>
            GitHub, auth, and billing — wired in
          </h2>
          <p className="qship-lede" style={{ maxWidth: 480, marginInline: "auto" }}>
            Octokit for repos and webhooks, BetterAuth for teams, Razorpay for plans and usage limits.
          </p>
        </Reveal>

        <div className="qship-hub">
          <div className="qship-hub-side">
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "rgba(234,67,53,0.1)",
                  border: "1px solid rgba(234,67,53,0.2)",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 12px",
                }}
              >
                <Github size={22} color="#ff6b6f" />
              </div>
              <div style={{ fontWeight: 700 }}>GitHub</div>
              <div style={{ fontSize: 13, color: "var(--qship-muted)", marginTop: 4 }}>Repos · PRs · Webhooks</div>
            </div>
          </div>

          <div className="qship-hub-center">
            <div className="qship-hub-logo">
              <QshipLogoMark size={88} />
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <QshipWordmark size="md" />
              <div style={{ fontSize: 11, color: "var(--qship-dim)", marginTop: 6 }}>tRPC monorepo</div>
            </div>
          </div>

          <div className="qship-hub-side">
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "rgba(227, 30, 36,0.1)",
                  border: "1px solid rgba(227, 30, 36,0.2)",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 12px",
                }}
              >
                <Bot size={22} color="#ff6b6f" />
              </div>
              <div style={{ fontWeight: 700 }}>AI SDK</div>
              <div style={{ fontSize: 13, color: "var(--qship-muted)", marginTop: 4 }}>PRD · Review · QA</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function QshipWorkflows() {
  return (
    <section id="workflows" className="qship-shell qship-section">
      <div className="qship-frame">
        <div className="qship-bento">
          <div className="qship-bento-title">
            <span className="qship-eyebrow">Capabilities</span>
            <h2 className="qship-h2" style={{ marginTop: 14, fontSize: "clamp(1.5rem, 3vw, 2.1rem)" }}>
              Everything for product delivery teams
            </h2>
            <p className="qship-lede" style={{ maxWidth: 280 }}>
              Built for ChaiCode — multi-tenant SaaS with real GitHub integration.
            </p>
          </div>

          {BENTO.map((cell) => (
            <div key={cell.title} className="qship-bento-cell">
              <div style={{ minHeight: 36, marginBottom: 14 }}>{cell.visual}</div>
              <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>{cell.title}</h3>
              <p style={{ fontSize: 13, color: "var(--qship-muted)", lineHeight: 1.6 }}>{cell.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function QshipCapabilities() {
  return (
    <section className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "72px 32px" }}>
        <Reveal>
          <span className="qship-eyebrow">What you can do</span>
          <h2 className="qship-h2" style={{ marginTop: 14, marginBottom: 12 }}>
            Built around the ShipFlow loop
          </h2>
          <p className="qship-lede" style={{ maxWidth: 480, marginBottom: 36 }}>
            Connect GitHub, intake requests, and let agents handle planning and QA — humans approve release.
          </p>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 1, border: "1px solid var(--qship-line)", borderRadius: 12, overflow: "hidden" }}>
          {CAPABILITIES.map((item, i) => (
            <Reveal key={item.title} delay={i * 60}>
              <div
                style={{
                  padding: 22,
                  borderRight: i < CAPABILITIES.length - 1 ? "1px solid var(--qship-line)" : undefined,
                  background: "rgba(255,255,255,0.015)",
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: "var(--qship-muted)", lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function QshipAgent() {
  return (
    <section id="agent" className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "72px 32px" }}>
        <div style={{ marginBottom: 36, maxWidth: 520 }}>
          <div className="qship-badge" style={{ marginBottom: 16 }}>
            <span className="qship-eyebrow" style={{ letterSpacing: "0.1em" }}>ShipFlow Agent</span>
          </div>
          <h2 className="qship-h2">Your QA &amp; engineering reviewer</h2>
          <p className="qship-lede" style={{ maxWidth: 420 }}>
            Clarify requirements, generate PRDs and tasks, analyze repos, and review PRs against acceptance
            criteria — with humans as the final decision makers.
          </p>
        </div>

        <QshipAgentDemo />
      </div>
    </section>
  );
}

export function QshipFaq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="qship-shell qship-section">
      <div className="qship-frame qship-faq-grid">
        <div>
          <span className="qship-eyebrow">Questions</span>
          <h2 className="qship-h2" style={{ marginTop: 14 }}>FAQ</h2>
          <p className="qship-lede">Questions about ShipFlow &amp; the ChaiCode build.</p>
        </div>

        <div>
          {FAQS.map((faq, i) => (
            <div key={faq.q} style={{ borderTop: "1px solid var(--qship-line)" }}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? -1 : i)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  padding: "18px 0",
                  textAlign: "left",
                  fontSize: 15,
                  color: open === i ? "var(--qship-text)" : "var(--qship-muted)",
                  fontWeight: open === i ? 600 : 400,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {faq.q}
                <ChevronDown size={16} style={{ transform: open === i ? "rotate(180deg)" : "none", transition: "transform 0.2s", opacity: 0.5 }} />
              </button>
              <div style={{ maxHeight: open === i ? 160 : 0, overflow: "hidden", transition: "max-height 0.25s ease" }}>
                <p style={{ paddingBottom: 18, fontSize: 14, lineHeight: 1.7, color: "var(--qship-muted)" }}>{faq.a}</p>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--qship-line)" }} />
        </div>
      </div>
    </section>
  );
}

export function QshipCta() {
  return (
    <section id="get-started" className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "80px 32px", textAlign: "center" }}>
        <div className="qship-cta-wrap" style={{ marginBottom: 0 }}>
          <video className="qship-mascot" src="/mascot.webm" autoPlay loop muted playsInline aria-hidden />
          <a href="/sign-in" className="qship-btn-primary">
            Get started free
          </a>
        </div>

        <p style={{ marginTop: 28, fontSize: 13, color: "var(--qship-dim)" }}>
          Free vs paid plans · AI review credits · repo limits via Razorpay
        </p>
      </div>
    </section>
  );
}

export function QshipFooter() {
  return (
    <footer className="qship-shell">
      <div className="qship-frame qship-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <QshipLogoMark size={22} />
          <QshipWordmark size="sm" />
          <span style={{ color: "var(--qship-line)" }}>|</span>
          <Github size={14} style={{ opacity: 0.4 }} />
        </div>
        <div className="qship-footer-links">
          <a href="#faq">FAQ</a>
          <a href="#workflows">Workflows</a>
          <a href="/privacy">Privacy Policy</a>
          <span>#chaicode #shipflow</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--qship-dim)" }}>
          Early preview · hackathon build
        </div>
      </div>
    </footer>
  );
}
