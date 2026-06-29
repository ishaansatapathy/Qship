"use client";



import { useState } from "react";

import {

  Bot,

  ClipboardList,

  Command,

  FileText,

  GitPullRequest,

  Kanban,

  ListChecks,

  Search,

  Sparkles,

} from "lucide-react";

import { QshipLogoMark, QshipWordmark } from "./qship-logo";

import { InViewAnnotation } from "./qship-reveal";



type DockTab = {

  id: string;

  label: string;

  path: string;

  icon: typeof FileText;

};



const DOCK: DockTab[] = [

  { id: "requests", label: "Requests", path: "/inbox", icon: FileText },

  { id: "prd", label: "PRD", path: "/brief", icon: ClipboardList },

  { id: "tasks", label: "Tasks", path: "/calendar", icon: Kanban },

  { id: "review", label: "Reviews", path: "/queue", icon: GitPullRequest },

];



function RequestsState() {

  return (

    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 380 }}>

      <div className="qship-hero-pane-side" style={{ borderRight: "1px solid var(--qship-line)", padding: 18 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>

          <QshipLogoMark size={20} />

          <QshipWordmark size="sm" />

        </div>

        <div className="qship-mono-tag" style={{ marginBottom: 12 }}>Feature requests</div>

        {["Export user data API", "Dark mode for dashboard", "SSO for enterprise"].map((title, i) => (

          <div

            key={title}

            className="qship-rotator-row"

            style={{ marginBottom: 8, opacity: i === 0 ? 1 : 0.55, borderColor: i === 0 ? "rgba(0,102,255,0.35)" : undefined }}

          >

            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>

              <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>

              <span style={{ fontSize: 11, color: "var(--qship-dim)" }}>Needs clarification</span>

            </div>

            {i === 0 ? <span className="qship-rotator-chip qship-rotator-chip--hot">New</span> : null}

          </div>

        ))}

      </div>

      <div style={{ padding: 22 }}>

        <div className="qship-rotator-bubble qship-rotator-bubble--user" style={{ marginBottom: 12 }}>

          Customer asked for GDPR data export — what fields should we include?

        </div>

        <div className="qship-rotator-bubble">

          <Bot size={12} style={{ opacity: 0.6 }} />

          <span>3 follow-up questions queued — educate if export already exists in Settings.</span>

        </div>

      </div>

    </div>

  );

}



function PrdState() {

  return (

    <div style={{ minHeight: 380, padding: "26px 28px" }}>

      <div className="qship-mono-tag">PRD · v1 draft</div>

      <h3 style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>User data export for compliance</h3>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>

        {["Problem statement", "Goals & non-goals", "User stories", "Acceptance criteria", "Edge cases"].map((section) => (

          <div key={section} className="qship-rotator-row">

            <Sparkles size={12} style={{ opacity: 0.5 }} />

            <span style={{ fontSize: 12.5 }}>{section}</span>

            <span className="qship-rotator-chip" style={{ marginLeft: "auto" }}>Generated</span>

          </div>

        ))}

      </div>

    </div>

  );

}



function TasksState() {

  const cols = ["Backlog", "In progress", "Review"];

  return (

    <div style={{ minHeight: 380, padding: "26px 28px" }}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>

        {cols.map((col, i) => (

          <div key={col} style={{ border: "1px solid var(--qship-line)", borderRadius: 10, padding: 10 }}>

            <div className="qship-mono-tag">{col}</div>

            {(i === 0 ? ["API route + auth", "Audit log table"] : i === 1 ? ["Rate limit middleware"] : ["QA re-review"]).map((task) => (

              <div key={task} className="qship-rotator-row" style={{ marginTop: 8, padding: 8 }}>

                <span style={{ fontSize: 11.5 }}>{task}</span>

              </div>

            ))}

          </div>

        ))}

      </div>

    </div>

  );

}



function ReviewState() {

  return (

    <div style={{ minHeight: 380, padding: "26px 28px" }}>

      <div className="qship-rotator-row" style={{ borderColor: "rgba(0,102,255,0.35)" }}>

        <GitPullRequest size={14} color="var(--qship-accent-bright)" />

        <div style={{ flex: 1 }}>

          <p style={{ fontSize: 13, fontWeight: 600 }}>feat: GDPR export endpoint</p>

          <p style={{ fontSize: 11, color: "var(--qship-dim)", marginTop: 4 }}>3 findings · 1 blocking</p>

        </div>

        <span className="qship-rotator-chip qship-rotator-chip--hot">Fix needed</span>

      </div>

      <div className="qship-rotator-invite" style={{ marginTop: 14 }}>

        <ListChecks size={13} />

        <span style={{ fontSize: 12 }}>Human approval pending — PRD, tasks, and AI review attached</span>

      </div>

    </div>

  );

}



const COMMANDS = [

  { icon: FileText, label: "New feature request", hint: "Intake with AI clarification" },

  { icon: ClipboardList, label: "Generate PRD", hint: "Structured product spec" },

  { icon: Kanban, label: "Create tasks", hint: "Kanban-ready engineering work" },

  { icon: Bot, label: "Run QA review", hint: "PR vs PRD & acceptance criteria" },

];



function CommandState() {

  return (

    <div style={{ minHeight: 380, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 4 }}>

      <div className="qship-hero-cmd-input">

        <Search size={13} style={{ opacity: 0.45 }} />

        <span style={{ color: "var(--qship-dim)" }}>Search workspace…</span>

        <span className="qship-hero-kbd-group">

          <kbd className="qship-hero-kbd">⌘</kbd>

          <kbd className="qship-hero-kbd">K</kbd>

        </span>

      </div>

      <div className="qship-mono-tag" style={{ padding: "16px 4px 8px" }}>Suggestions</div>

      {COMMANDS.map((cmd, i) => (

        <div key={cmd.label} className="qship-hero-cmd-row" data-first={i === 0}>

          <span className="qship-hero-cmd-icon">

            <cmd.icon size={14} />

          </span>

          <span style={{ fontSize: 13, fontWeight: 500 }}>{cmd.label}</span>

          <span style={{ fontSize: 12, color: "var(--qship-dim)" }}>{cmd.hint}</span>

        </div>

      ))}

    </div>

  );

}



const STATES: Record<string, () => React.ReactNode> = {

  requests: RequestsState,

  prd: PrdState,

  tasks: TasksState,

  review: ReviewState,

  command: CommandState,

};



export function QshipHero() {

  const [tab, setTab] = useState("requests");

  const activeTab = DOCK.find((d) => d.id === tab) ?? DOCK[0]!;

  const StateView = STATES[tab] ?? RequestsState;



  return (

    <section className="qship-hero">
      <div className="qship-grid-bg" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

      <div className="qship-shell qship-section">

        <div className="qship-frame">

          <div className="qship-hero-body qship-fade-up">

            <h1 className="qship-headline" data-hero-font="minecraft">

              Ship features with

              <br />

              <span className="qship-headline-accent">AI velocity — human control.</span>

            </h1>



            <p

              style={{

                marginTop: 22,

                maxWidth: 560,

                marginInline: "auto",

                fontSize: "1.05rem",

                lineHeight: 1.75,

                color: "var(--qship-muted)",

              }}

            >

              ShipFlow turns messy requests into PRDs, engineering tasks, and GitHub PRs — then runs a{" "}
              <strong style={{ color: "var(--qship-text)", fontWeight: 600 }}>
                <InViewAnnotation type="underline" delay={600} strokeWidth={2}>
                  QA agent loop
                </InViewAnnotation>
              </strong>{" "}
              before humans approve release.
            </p>



            <div style={{ marginTop: 40, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>

              <a href="#get-started" className="qship-btn-primary">
                Start free
              </a>

              <a href="#how" className="qship-btn-ghost">

                See the workflow

              </a>

            </div>



            <p style={{ marginTop: 28, fontSize: 12, color: "var(--qship-dim)" }}>

              Next.js · tRPC · GitHub · Inngest · Drizzle · BetterAuth · Razorpay

            </p>

          </div>



          <div id="preview" className="qship-preview-window">

            <div className="qship-preview-chrome">

              <div style={{ display: "flex", gap: 6 }}>

                {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (

                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />

                ))}

              </div>

              <div

                style={{

                  flex: 1,

                  maxWidth: 300,

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

                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--qship-dim)" }} />

                {activeTab.path}

              </div>

            </div>



            <div key={tab} className="qship-hero-state">

              <StateView />

            </div>

          </div>



          <div className="qship-hero-dock" role="tablist" aria-label="Preview tabs">

            {DOCK.map((d) => (

              <button

                key={d.id}

                type="button"

                role="tab"

                aria-selected={tab === d.id}

                className="qship-hero-dock-btn"

                data-active={tab === d.id}

                onClick={() => setTab(d.id)}

              >

                {tab === d.id && <span className="qship-hero-dock-tip">{d.label}</span>}

                <d.icon size={17} />

              </button>

            ))}

            <button

              type="button"

              role="tab"

              aria-selected={tab === "command"}

              className="qship-hero-dock-btn"

              data-active={tab === "command"}

              onClick={() => setTab("command")}

            >

              {tab === "command" && <span className="qship-hero-dock-tip">Search</span>}

              <Command size={17} />

            </button>

          </div>

        </div>

      </div>

    </section>

  );

}

