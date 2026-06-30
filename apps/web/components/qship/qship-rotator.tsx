"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, ClipboardList, GitPullRequest, Kanban, Sparkles, Zap } from "lucide-react";

type RotatorItem = {
  phrase: string;
  label: string;
  desc: string;
  icon: ReactNode;
  panel: ReactNode;
};

function Bar({ w, strong = false }: { w: number | string; strong?: boolean }) {
  return (
    <span
      className="qship-skel-bar"
      style={{ width: w, opacity: strong ? 0.8 : undefined }}
    />
  );
}

function PanelRow({ chip, chipTone, children }: { chip?: string; chipTone?: "hot" | "cool"; children: ReactNode }) {
  return (
    <div className="qship-rotator-row">
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>{children}</div>
      {chip && <span className={`qship-rotator-chip qship-rotator-chip--${chipTone ?? "cool"}`}>{chip}</span>}
    </div>
  );
}

const ITEMS: RotatorItem[] = [
  {
    phrase: "Clarify requirements.",
    label: "Discovery",
    desc: "The agent asks follow-ups, educates when a feature exists, or proceeds to planning.",
    icon: <Sparkles size={13} />,
    panel: (
      <div className="qship-rotator-stack">
        <PanelRow chip="Clarify" chipTone="hot">
          <Bar w="72%" strong />
          <Bar w="46%" />
        </PanelRow>
        <PanelRow chip="Educate">
          <Bar w="60%" strong />
          <Bar w="38%" />
        </PanelRow>
      </div>
    ),
  },
  {
    phrase: "Generate PRDs.",
    label: "Planning",
    desc: "Structured specs with goals, user stories, acceptance criteria, and edge cases.",
    icon: <ClipboardList size={13} />,
    panel: (
      <div className="qship-rotator-stack">
        <div className="qship-rotator-compose">
          <Bar w="84%" strong />
          <Bar w="92%" />
          <Bar w="64%" />
        </div>
        <div className="qship-rotator-footrow">
          <span className="qship-rotator-chip qship-rotator-chip--cool">PRD v1</span>
          <span style={{ fontSize: 11, color: "var(--qship-dim)" }}>ready for task breakdown</span>
        </div>
      </div>
    ),
  },
  {
    phrase: "Track on kanban.",
    label: "Tasks",
    desc: "Engineering tasks organized for team review before development starts.",
    icon: <Kanban size={13} />,
    panel: (
      <div className="qship-rotator-stack">
        <div className="qship-rotator-invite">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Kanban size={14} color="var(--qship-accent-bright)" />
            <span style={{ fontSize: 12, fontWeight: 600 }}>3 columns · 8 tasks</span>
          </div>
          <Bar w="58%" />
        </div>
      </div>
    ),
  },
  {
    phrase: "Review pull requests.",
    label: "AI QA",
    desc: "QA agent checks PRs against PRD, acceptance criteria, security, and performance.",
    icon: <GitPullRequest size={13} />,
    panel: (
      <div className="qship-rotator-stack">
        <PanelRow chip="Blocking" chipTone="hot">
          <Bar w="68%" strong />
          <Bar w="42%" />
        </PanelRow>
        <PanelRow chip="OK">
          <Bar w="56%" />
          <Bar w="34%" />
        </PanelRow>
      </div>
    ),
  },
  {
    phrase: "Run async workflows.",
    label: "Inngest",
    desc: "Long-running PRD, analysis, and re-review jobs with visible progress in-app.",
    icon: <Bot size={13} />,
    panel: (
      <div className="qship-rotator-stack">
        <div className="qship-rotator-bubble qship-rotator-bubble--user">
          &ldquo;Review PR #42 against the GDPR export PRD&rdquo;
        </div>
        <div className="qship-rotator-bubble">
          <Bot size={12} style={{ opacity: 0.6 }} />
          <span>2 blocking · 1 non-blocking — fix loop started</span>
        </div>
      </div>
    ),
  },
  {
    phrase: "Approve to ship.",
    label: "Human gate",
    desc: "Reviewers sign off on PRD, tasks, PR, and AI history before release.",
    icon: <Zap size={13} />,
    panel: (
      <div className="qship-rotator-stack qship-rotator-stack--log">
        <div className="qship-rotator-log"><span>prd.approved</span><span className="qship-rotator-log-ok">done</span></div>
        <div className="qship-rotator-log"><span>qa.re-review.passed</span><span className="qship-rotator-log-ok">done</span></div>
        <div className="qship-rotator-log"><span>release.shipped</span><span className="qship-rotator-log-ok">live</span></div>
      </div>
    ),
  },
];

const INTERVAL_MS = 2400;

export function QshipRotator() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = setInterval(() => {
      setActive((prev) => (prev + 1) % ITEMS.length);
    }, INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused]);

  const item = ITEMS[active] ?? ITEMS[0]!;

  return (
    <section className="qship-shell qship-section">
      <div className="qship-frame qship-rotator" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="qship-rotator-copy">
          <h2 className="qship-h2" style={{ marginBottom: 22 }}>
            What else can Qship do?
          </h2>

          <p className="qship-rotator-phrases">
            {ITEMS.map((it, i) => (
              <button
                key={it.phrase}
                type="button"
                className="qship-rotator-phrase"
                data-active={i === active ? "true" : undefined}
                onClick={() => setActive(i)}
              >
                {it.phrase}
              </button>
            ))}{" "}
            <span className="qship-rotator-phrase qship-rotator-phrase--static">
              And much, much more.
            </span>
          </p>

          <div className="qship-rotator-meta">
            <div key={active} className="qship-rotator-meta-body">
              <span className="qship-rotator-badge">
                {item.icon}
                {item.label}
              </span>
              <p className="qship-rotator-desc">{item.desc}</p>
            </div>
          </div>
        </div>

        <div className="qship-rotator-window">
          <div className="qship-rotator-window-chrome">
            <span className="qship-rotator-dot" />
            <span className="qship-rotator-dot" />
            <span className="qship-rotator-dot" />
            <span className="qship-rotator-window-label">example</span>
          </div>
          <div key={active} className="qship-rotator-panel">
            {item.panel}
          </div>
        </div>
      </div>
    </section>
  );
}
