"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, GitPullRequest, Sparkles, Zap } from "lucide-react";
import { Reveal } from "./qship-reveal";

type Slide = {
  id: string;
  title: string;
  desc: string;
  back: ReactNode;
  front: ReactNode;
};

function Window({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <div className="thread-show-window" data-accent={accent}>
      <div className="thread-show-window-head">
        <span className="qship-rotator-dot" />
        <span className="qship-rotator-dot" />
        <span style={{ marginLeft: 8, fontFamily: "var(--qship-mono)", fontSize: 10, color: "var(--qship-dim)" }}>
          {title}
        </span>
      </div>
      <div className="thread-show-window-body">{children}</div>
    </div>
  );
}

function SkelBar({ w, strong = false }: { w: string; strong?: boolean }) {
  return <span className="thread-skel-bar" style={{ width: w, opacity: strong ? 0.8 : undefined }} />;
}

const SLIDES: Slide[] = [
  {
    id: "webhook",
    title: "Request lands, agent responds",
    desc: "Feature requests from any channel trigger clarification, education, or PRD generation via Inngest.",
    back: (
      <Window title="github · webhook">
        <div className="qship-rotator-stack qship-rotator-stack--log">
          <div className="qship-rotator-log"><span>feature.request.created</span><span className="qship-rotator-log-ok">200</span></div>
          <div className="qship-rotator-log"><span>agent.clarification.started</span><span className="qship-rotator-log-ok">200</span></div>
          <div className="qship-rotator-log" style={{ opacity: 0.4 }}><span>prd.generation.queued</span><span>…</span></div>
        </div>
      </Window>
    ),
    front: (
      <Window title="shipflow · requests" accent>
        <div className="qship-rotator-stack">
          <div className="qship-rotator-row" style={{ borderColor: "rgba(227, 30, 36,0.35)" }}>
            <Zap size={13} color="var(--qship-accent-bright)" style={{ flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              <SkelBar w="62%" strong />
              <SkelBar w="38%" />
            </div>
            <span className="qship-rotator-chip qship-rotator-chip--hot">New</span>
          </div>
        </div>
      </Window>
    ),
  },
  {
    id: "rank",
    title: "PRD and tasks, ready for dev",
    desc: "Structured PRDs become kanban tasks — teams approve the plan before code starts.",
    back: (
      <Window title="shipflow · prd">
        <div className="qship-rotator-stack">
          <div className="qship-rotator-row">
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              <SkelBar w="66%" strong />
              <SkelBar w="42%" />
            </div>
            <span className="qship-rotator-chip qship-rotator-chip--hot">PRD</span>
          </div>
        </div>
      </Window>
    ),
    front: (
      <Window title="shipflow · tasks" accent>
        <div className="qship-rotator-stack">
          {[
            { icon: Sparkles, label: "Generate PRD" },
            { icon: Bot, label: "Break into tasks" },
            { icon: GitPullRequest, label: "Link GitHub repo" },
          ].map((row, i) => (
            <div key={row.label} className="qship-hero-cmd-row" data-first={i === 0} style={{ border: "1px solid var(--qship-line-soft)", borderRadius: 9 }}>
              <span className="qship-hero-cmd-icon" style={{ width: 24, height: 24 }}>
                <row.icon size={12} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{row.label}</span>
              <span className="qship-rotator-chip" style={{ marginLeft: "auto" }}>AI</span>
            </div>
          ))}
        </div>
      </Window>
    ),
  },
  {
    id: "approve",
    title: "Review, fix, re-review, ship",
    desc: "QA agent loops until release-ready. Humans verify PRD, tasks, PR, and review history.",
    back: (
      <Window title="shipflow · review">
        <div className="qship-rotator-stack">
          <div className="qship-rotator-row">
            <GitPullRequest size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              <SkelBar w="58%" strong />
            </div>
            <span className="qship-rotator-chip">Blocking</span>
          </div>
        </div>
      </Window>
    ),
    front: (
      <Window title="shipflow · shipped" accent>
        <div className="qship-rotator-stack">
          <div className="thread-show-done">
            <CheckCircle2 size={15} color="var(--qship-accent-bright)" />
            <span>AI review passed</span>
          </div>
          <div className="thread-show-done">
            <CheckCircle2 size={15} color="var(--qship-accent-bright)" />
            <span>Human approved release</span>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--qship-dim)", paddingTop: 4 }}>
            Feature shipped to production
          </p>
        </div>
      </Window>
    ),
  },
];

const SLIDE_MS = 4200;

export function QshipShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((p) => (p + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [paused]);

  const slide = SLIDES[active] ?? SLIDES[0]!;

  return (
    <section className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "72px 32px" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 40 }}>
          <span className="qship-eyebrow">Automation</span>
          <h2 className="qship-h2" style={{ marginTop: 16 }}>
            From request to shipped — async &amp; visible
          </h2>
        </Reveal>

        <div
          className="thread-show-stage"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={`b-${active}`} className="thread-show-back">
            {slide.back}
          </div>
          <div key={`f-${active}`} className="thread-show-front">
            {slide.front}
          </div>
        </div>

        <div className="thread-show-caption" key={`c-${active}`}>
          <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>{slide.title}</h3>
          <p style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.65, color: "var(--qship-muted)", maxWidth: 440, marginInline: "auto" }}>
            {slide.desc}
          </p>
        </div>

        <div className="thread-show-segments" role="tablist" aria-label="Automation steps">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              className="thread-show-segment"
              data-active={i === active}
              onClick={() => setActive(i)}
            >
              <span
                className="thread-show-segment-fill"
                data-active={i === active && !paused}
                style={{ animationDuration: `${SLIDE_MS}ms` }}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
