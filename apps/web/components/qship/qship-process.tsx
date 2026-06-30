"use client";

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Bot, ClipboardList, GitPullRequest, Kanban, Sparkles } from "lucide-react";
import { FlowDottedConnectors } from "./qship-flow-connectors";

const STEPS = [
  {
    icon: Sparkles,
    title: "Discovery",
    desc: "Feature requests arrive from any channel. The agent clarifies requirements or educates if the capability already exists.",
  },
  {
    icon: ClipboardList,
    title: "PRD plan",
    desc: "Structured PRDs with problem statement, goals, user stories, acceptance criteria, edge cases, and success metrics.",
  },
  {
    icon: Kanban,
    title: "Task board",
    desc: "Engineering tasks on a kanban board — teams review and approve before development starts.",
  },
  {
    icon: GitPullRequest,
    title: "Build & review",
    desc: "GitHub PRs linked to the PRD. The QA agent reviews against requirements, security, performance, and code quality.",
  },
  {
    icon: Bot,
    title: "Human ship gate",
    desc: "Reviewers verify PRD, tasks, PR, and AI history. Only approved work moves to Shipped.",
  },
];

/** Each stage reveals only when it scrolls into view — undo on scroll up. */
function useStageInView() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: 0.35, rootMargin: "0px 0px -22% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, visible };
}

export function QshipProcess() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [boxVisible, setBoxVisible] = useState<boolean[]>(() => STEPS.map(() => false));
  const [edgeVisible, setEdgeVisible] = useState<boolean[]>(() =>
    STEPS.slice(0, -1).map(() => false),
  );

  const syncBox = useCallback((index: number, visible: boolean) => {
    setBoxVisible((prev) => {
      if (prev[index] === visible) return prev;
      const next = [...prev];
      next[index] = visible;
      return next;
    });
  }, []);

  const syncEdge = useCallback((index: number, visible: boolean) => {
    setEdgeVisible((prev) => {
      if (prev[index] === visible) return prev;
      const next = [...prev];
      next[index] = visible;
      return next;
    });
  }, []);

  const { ref: headRef, visible: headVisible } = useStageInView();
  const { ref: footRef, visible: footVisible } = useStageInView();

  const jumpToStep = useCallback((i: number) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <section id="how" className="qship-shell qship-section">
      <div className="qship-frame">
        <div className="qship-process-head" ref={headRef}>
          <div className="qship-flow-reveal" data-visible={headVisible}>
            <span className="qship-eyebrow">How it works</span>
            <h2 className="qship-h2" style={{ marginTop: 16 }}>
              From request to shipped
            </h2>
            <p className="qship-lede" style={{ maxWidth: 520 }}>
              Five phases — discovery, planning, development, AI review, and human approval.
            </p>

            <div className="qship-process-rail" role="tablist" aria-label="Process steps">
              {STEPS.map((step, i) => (
                <button
                  key={step.title}
                  type="button"
                  role="tab"
                  aria-selected={boxVisible[i] ?? false}
                  className="qship-process-pill"
                  data-active={boxVisible[i] ?? false}
                  onClick={() => jumpToStep(i)}
                >
                  <span className="qship-process-pill-dot" data-active={boxVisible[i] ?? false} />
                  <span style={{ fontFamily: "var(--qship-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
                    0{i + 1}
                  </span>
                  {step.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="qship-flow-scroll">
          <FlowDottedConnectors
            cardRefs={cardRefs}
            edgeVisible={edgeVisible.map((edge, i) => edge && (boxVisible[i] ?? false))}
          />

          {STEPS.map((step, i) => {
            const align = i % 2 === 0 ? "left" : "right";

            return (
              <Fragment key={step.title}>
                <StageWatcher onChange={(v) => syncBox(i, v)}>
                  <div className={`qship-flow-row qship-flow-row--${align}`}>
                    <FlowStepCard
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      align={align}
                      index={i}
                      isLast={i === STEPS.length - 1}
                      visible={boxVisible[i] ?? false}
                      icon={<step.icon size={18} />}
                      num={`0${i + 1}`}
                      title={step.title}
                      desc={step.desc}
                    />
                  </div>
                </StageWatcher>

                {i < STEPS.length - 1 && (
                  <StageWatcher onChange={(v) => syncEdge(i, v)}>
                    <div className="qship-flow-edge-stage" aria-hidden />
                  </StageWatcher>
                )}
              </Fragment>
            );
          })}
        </div>

        <div className="qship-process-foot" ref={footRef}>
          <div className="qship-flow-reveal" data-visible={footVisible}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--qship-accent-bright)",
                  boxShadow: "0 0 10px var(--qship-accent-glow)",
                }}
              />
              Every step runs through{" "}
              <strong style={{ color: "var(--qship-text)", fontWeight: 600 }}>Inngest + tRPC</strong> — long-running
              PRD, review, and re-review workflows stay visible in the app.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Observes its wrapper and reports visibility upward. */
function StageWatcher({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange: (visible: boolean) => void;
}) {
  const { ref, visible } = useStageInView();

  useEffect(() => {
    onChange(visible);
  }, [visible, onChange]);

  return <div ref={ref}>{children}</div>;
}

const FlowStepCard = forwardRef<
  HTMLDivElement,
  {
    align: "left" | "right";
    index: number;
    isLast: boolean;
    visible: boolean;
    icon: ReactNode;
    num: string;
    title: string;
    desc: string;
  }
>(function FlowStepCard({ align, index, isLast, visible, icon, num, title, desc }, ref) {
  return (
    <div className="qship-flow-reveal" data-visible={visible}>
      <div
        ref={ref}
        className={`qship-flow-step qship-flow-step--${align}`}
        data-connect={align}
      >
        {!isLast && <span className="qship-flow-anchor qship-flow-anchor--out" aria-hidden />}
        {index > 0 && <span className="qship-flow-anchor qship-flow-anchor--in" aria-hidden />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="qship-flow-icon">{icon}</span>
          <span className="qship-flow-num">{num}</span>
        </div>
        <div className="qship-flow-title">{title}</div>
        <div className="qship-flow-desc">{desc}</div>
      </div>
    </div>
  );
});
