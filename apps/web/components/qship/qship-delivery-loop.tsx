import Image from "next/image";
import Link from "next/link";
import { Reveal } from "./qship-reveal";

const STEPS = [
  { num: "01", tag: "Phase 1", title: "Product discovery", desc: "Intake requests, clarify with AI, educate if the feature already exists." },
  { num: "02", tag: "Phase 2", title: "Planning", desc: "Structured PRDs become kanban tasks — teams approve before dev." },
  { num: "03", tag: "Phase 3", title: "Development", desc: "GitHub repos connected; PRs implement PRD requirements." },
  { num: "04", tag: "Phase 4", title: "AI review loop", desc: "QA agent reviews against PRD, criteria, security, and edge cases." },
  { num: "05", tag: "Phase 5", title: "Human approval", desc: "Reviewers verify everything — only then does it ship." },
];

export function QshipDeliveryLoop() {
  return (
    <section id="how" className="qship-shell qship-section">
      <div className="qship-frame" style={{ padding: "72px 32px" }}>
        <Reveal>
          <span className="qship-eyebrow">Core loop</span>
          <h2 className="qship-h2" style={{ marginTop: 14, maxWidth: 480 }}>
            Request to production — one structured pipeline
          </h2>
        </Reveal>

        <div
          style={{
            marginTop: 36,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {STEPS.map((step, i) => (
            <Reveal key={step.num} delay={i * 60}>
              <article
                style={{
                  padding: 20,
                  borderRadius: 12,
                  border: "1px solid var(--qship-line)",
                  background: "rgba(255,255,255,0.02)",
                  height: "100%",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--qship-dim)",
                      border: "1px solid var(--qship-line)",
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}
                  >
                    {step.tag}
                  </span>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "var(--qship-accent)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {step.num}
                  </span>
                </div>
                <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 600 }}>{step.title}</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: "var(--qship-muted)", lineHeight: 1.65 }}>
                  {step.desc}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div
            style={{
              marginTop: 32,
              padding: 20,
              borderRadius: 12,
              border: "1px solid rgba(227,30,36,0.3)",
              background: "rgba(227,30,36,0.05)",
              textAlign: "center",
            }}
          >
            <p style={{ fontFamily: "var(--qship-mono)", fontSize: 12, lineHeight: 1.8, color: "var(--qship-accent-bright)" }}>
              Feature Request → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship
            </p>
          </div>
        </Reveal>

        <Reveal delay={160} style={{ textAlign: "center", marginTop: 48 }}>
          <Image src="/mascot-hero.png" alt="" width={100} height={100} className="mx-auto object-contain" />
          <h3 className="qship-h2" style={{ marginTop: 20, fontSize: "clamp(1.4rem, 3vw, 2rem)" }}>
            Ready to ship with structure?
          </h3>
          <p className="qship-lede" style={{ maxWidth: 400, marginInline: "auto" }}>
            Built for ChaiCode — AI velocity with human governance on every release.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/inbox" className="qship-btn-primary">
              Open dashboard
            </Link>
            <Link href="/sign-in" className="qship-btn-ghost">
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
