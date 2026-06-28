"use client";

import { useRef, useState } from "react";

const TESTIMONIALS = [
  {
    id: 1,
    quote:
      "Qship changed how our team ships. The human approval gate catches things our reviewers miss at 2am — it's like having a senior dev always on call.",
    name: "Priya Mehta",
    title: "Engineering Lead @ Scale",
    avatar: "PM",
    color: "#6366f1",
  },
  {
    id: 2,
    quote:
      "The PRD generation alone saves us 3 hours per feature. We go from vague Slack message to structured requirements in minutes, not days.",
    name: "Jordan Buffaloe",
    title: "CTO @ Nexus Labs",
    avatar: "JB",
    color: "#f97316",
  },
  {
    id: 3,
    quote:
      "We use Qship as our AI governance layer. Every PR goes through its review pipeline before our engineers even see it. Code quality went up 40%.",
    name: "Tyler Kron",
    title: "VP Engineering @ CloudAxis",
    avatar: "TK",
    color: "#e31e24",
    highlight: true,
  },
  {
    id: 4,
    quote:
      "The ⌘K command palette is genuinely keyboard-first. I never touch the mouse anymore. It's the linear.app of AI delivery tools.",
    name: "Aria Chen",
    title: "Staff Engineer @ Vercel",
    avatar: "AC",
    color: "#22c55e",
  },
  {
    id: 5,
    quote:
      "Qship's cross-repo context means our microservices team finally understands the full impact of a change before it ships. Fewer incidents, happier oncall.",
    name: "Dev Sharma",
    title: "Platform Lead @ Stripe",
    avatar: "DS",
    color: "#a855f7",
  },
];

export function QshipTestimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    startX.current = e.pageX - (trackRef.current?.offsetLeft ?? 0);
    scrollLeft.current = trackRef.current?.scrollLeft ?? 0;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const x = e.pageX - (trackRef.current?.offsetLeft ?? 0);
    const walk = (x - startX.current) * 1.5;
    if (trackRef.current) trackRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const onMouseUp = () => setDragging(false);

  return (
    <section className="qship-testimonials-section qship-section">
      <div className="qship-frame" style={{ padding: "80px 0 0" }}>
        <div style={{ textAlign: "center", padding: "0 32px 52px" }}>
          <span className="qship-eyebrow">Loved by engineering teams</span>
          <h2 className="qship-h2" style={{ marginTop: 16, maxWidth: 520, marginInline: "auto" }}>
            Teams that care how code ships
          </h2>
          <p className="qship-lede" style={{ maxWidth: 440, marginInline: "auto" }}>
            From seed-stage startups to enterprise engineering orgs — Qship is the AI governance
            layer teams actually want.
          </p>
        </div>

        {/* Drag-scrollable testimonials track */}
        <div
          ref={trackRef}
          className="qship-testimonials-track"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          {/* Left fade sentinel */}
          <div style={{ minWidth: 64, flexShrink: 0 }} />

          {TESTIMONIALS.map((t) => (
            <div
              key={t.id}
              className="qship-testimonial-card"
              data-highlight={t.highlight ? "true" : undefined}
            >
              {t.highlight && (
                <div className="qship-testimonial-highlight-ring" aria-hidden />
              )}

              <div className="qship-testimonial-quote-mark">&ldquo;</div>

              <p className="qship-testimonial-quote">{t.quote}</p>

              <div className="qship-testimonial-author">
                <div
                  className="qship-testimonial-avatar"
                  style={{ background: `${t.color}22`, border: `1px solid ${t.color}55`, color: t.color }}
                >
                  {t.avatar}
                </div>
                <div>
                  <div className="qship-testimonial-name">{t.name}</div>
                  <div className="qship-testimonial-title">{t.title}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Right fade sentinel */}
          <div style={{ minWidth: 64, flexShrink: 0 }} />
        </div>

        <div className="qship-testimonials-drag-hint">
          <span>Drag to explore</span>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
            <path d="M1 5H15M11 1L15 5L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </section>
  );
}
