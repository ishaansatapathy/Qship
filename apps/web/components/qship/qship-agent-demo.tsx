"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bot, ClipboardList, GitPullRequest, Kanban, CheckCircle2 } from "lucide-react";

type Scenario = {
  id: string;
  chip: string;
  icon: typeof Bot;
  prompt: string;
  reply: string;
  effectTitle: string;
  effect: ReactNode;
};

function SkelBar({ w, strong = false }: { w: string; strong?: boolean }) {
  return <span className="qship-skel-bar" style={{ width: w, opacity: strong ? 0.8 : undefined }} />;
}

const SCENARIOS: Scenario[] = [
  {
    id: "prd",
    chip: "Generate PRD",
    icon: ClipboardList,
    prompt: "@ShipFlow turn this feature request into a structured PRD",
    reply: "PRD draft ready — problem, goals, user stories, acceptance criteria, and edge cases included.",
    effectTitle: "Planning · PRD v1",
    effect: (
      <div className="qship-rotator-stack">
        <div className="qship-rotator-row" style={{ borderColor: "rgba(0, 102, 255, 0.35)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
            <SkelBar w="64%" strong />
            <SkelBar w="40%" />
          </div>
          <span className="qship-rotator-chip qship-rotator-chip--hot">PRD</span>
        </div>
        <div className="qship-agent-effect-note">
          <CheckCircle2 size={12} />
          Team can review before task breakdown
        </div>
      </div>
    ),
  },
  {
    id: "tasks",
    chip: "Create tasks",
    icon: Kanban,
    prompt: "@ShipFlow break the GDPR export PRD into engineering tasks",
    reply: "8 tasks created across Backlog, In progress, and Review columns.",
    effectTitle: "Task board · 8 tasks",
    effect: (
      <div className="qship-rotator-stack">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {["Backlog", "Build", "Review"].map((d, i) => (
            <div key={d} className="qship-hero-day" data-active={i === 1} style={{ padding: "9px 4px" }}>
              <span style={{ fontFamily: "var(--qship-mono)", fontSize: 9, letterSpacing: "0.08em" }}>{d}</span>
              <div className="qship-hero-day-slot" data-active={i === 1} style={{ height: 18 }} />
            </div>
          ))}
        </div>
        <div className="qship-agent-effect-note">
          <CheckCircle2 size={12} />
          Awaiting team approval to start development
        </div>
      </div>
    ),
  },
  {
    id: "review",
    chip: "QA review",
    icon: GitPullRequest,
    prompt: "@ShipFlow review PR #42 against the PRD and acceptance criteria",
    reply: "3 findings — 1 blocking (missing rate limit). Fix loop started.",
    effectTitle: "AI review · PR #42",
    effect: (
      <div className="qship-rotator-stack">
        <div className="qship-rotator-row">
          <GitPullRequest size={13} style={{ opacity: 0.6 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
            <SkelBar w="68%" strong />
            <SkelBar w="36%" />
          </div>
          <span className="qship-rotator-chip qship-rotator-chip--hot">Blocking</span>
        </div>
        {["Audit log missing", "Test gap on criterion #4"].map((w, i) => (
          <div key={w} className="qship-rotator-row" style={{ opacity: 1 - i * 0.22 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
              <SkelBar w="61%" strong={i === 0} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export function QshipAgentDemo() {
  const [active, setActive] = useState(0);
  const [stage, setStage] = useState(0); // 0 = prompt, 1 = thinking, 2 = reply + effect

  useEffect(() => {
    setStage(0);
    const t1 = setTimeout(() => setStage(1), 500);
    const t2 = setTimeout(() => setStage(2), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active]);

  const scenario = SCENARIOS[active] ?? SCENARIOS[0]!;

  return (
    <div className="qship-agent-demo">
      <div className="qship-agent-chips" role="tablist" aria-label="Agent scenarios">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className="qship-agent-chip"
            data-active={i === active}
            onClick={() => setActive(i)}
          >
            <s.icon size={13} />
            {s.chip}
          </button>
        ))}
        <span className="qship-mono-tag" style={{ marginLeft: "auto", alignSelf: "center" }}>
          Example interaction
        </span>
      </div>

      <div className="qship-agent-grid">
        <div className="qship-agent-chat">
          <div className="qship-agent-chat-head">
            <Bot size={13} style={{ opacity: 0.6 }} />
            <span>ShipFlow agent</span>
          </div>

          <div className="qship-agent-chat-body">
            <div key={`p-${active}`} className="qship-rotator-bubble qship-rotator-bubble--user qship-agent-msg">
              {scenario.prompt}
            </div>

            {stage === 1 && (
              <div className="qship-rotator-bubble qship-agent-msg" aria-label="Agent typing">
                <span className="qship-agent-typing">
                  <i /><i /><i />
                </span>
              </div>
            )}

            {stage === 2 && (
              <div key={`r-${active}`} className="qship-rotator-bubble qship-agent-msg" style={{ maxWidth: "92%" }}>
                <Bot size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
                <span>{scenario.reply}</span>
              </div>
            )}
          </div>

          <div className="qship-agent-input">
            <span style={{ color: "var(--qship-dim)" }}>Reply…</span>
            <span className="qship-hero-kbd" style={{ marginLeft: "auto" }}>↵</span>
          </div>
        </div>

        <div className="qship-agent-effect" data-live={stage === 2}>
          <div className="qship-agent-effect-head">
            <span className="qship-agent-effect-dot" data-live={stage === 2} />
            {scenario.effectTitle}
          </div>
          <div key={`e-${active}-${stage === 2}`} className={stage === 2 ? "qship-agent-effect-body qship-agent-effect-body--in" : "qship-agent-effect-body"}>
            {stage === 2 ? (
              scenario.effect
            ) : (
              <div className="qship-agent-effect-wait">
                <span className="qship-agent-typing"><i /><i /><i /></span>
                waiting for agent…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
