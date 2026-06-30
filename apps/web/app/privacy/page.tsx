import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Qship",
  description: "How Qship handles your data.",
};

export default function PrivacyPage() {
  return (
    <main className="qship-privacy">
      <Link href="/" className="qship-privacy-back">
        ← Back to Qship
      </Link>

      <h1 className="qship-privacy-title">Privacy Policy</h1>
      <p className="qship-privacy-updated">Last updated: June 2026</p>

      <Section title="Overview">
        Qship is an AI-assisted product delivery platform
        for software teams. We are committed to protecting your privacy. This policy explains what
        data we collect, how we use it, and how it is stored.
      </Section>

      <Section title="Data We Collect">
        <ul>
          <li>
            <strong>Account data</strong> — name, email, and workspace membership when you sign up
            (email/password or Google OAuth via BetterAuth).
          </li>
          <li>
            <strong>Feature delivery data</strong> — feature requests, PRDs, engineering tasks,
            clarifications, pipeline status, and delivery timeline events you create in the app.
          </li>
          <li>
            <strong>GitHub integration data</strong> — when you connect a GitHub App installation, we
            store installation metadata and linked repository names to support the delivery workflow.
          </li>
          <li>
            <strong>Agent sessions</strong> — chat history and tool memory for the Qship Agent,
            tied to your account.
          </li>
        </ul>
      </Section>

      <Section title="How We Use Your Data">
        <ul>
          <li>To run the feature delivery pipeline (triage, PRD generation, task breakdown, reviews).</li>
          <li>To power the Qship Agent and MCP tools scoped to your workspace.</li>
          <li>To connect and sync GitHub repositories you authorize.</li>
          <li>To authenticate you and secure your session.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data or use it for advertising.
        </p>
      </Section>

      <Section title="AI Processing">
        <p>
          AI features (triage, PRD, tasks, agent chat, pre-ship review) are processed via the OpenAI
          API when you configure an API key. Content sent to OpenAI is used to generate responses for
          you and is handled per OpenAI&apos;s{" "}
          <a
            href="https://openai.com/policies/api-data-usage-policies"
            target="_blank"
            rel="noreferrer"
          >
            API data usage policy
          </a>
          .
        </p>
      </Section>

      <Section title="Data Storage">
        <p>
          Application data is stored in a PostgreSQL database tied to your account and workspace.
          Session cookies are httpOnly. GitHub webhook payloads are verified and processed; we do not
          store raw webhook secrets in the database.
        </p>
      </Section>

      <Section title="Third-Party Services">
        <ul>
          <li>
            <strong>Google OAuth</strong> — optional sign-in (BetterAuth).
          </li>
          <li>
            <strong>GitHub</strong> — optional GitHub App for repository linking.
          </li>
          <li>
            <strong>OpenAI</strong> — AI triage, PRD, agent, and review features.
          </li>
          <li>
            <strong>Hosting</strong> — deployment provider (e.g. Vercel, Railway) for web and API.
          </li>
        </ul>
      </Section>

      <Section title="Your Rights">
        <p>You may at any time:</p>
        <ul>
          <li>Disconnect GitHub from the Settings page.</li>
          <li>Request deletion of your account data by contacting us.</li>
          <li>Revoke Google OAuth from your Google Account permissions if you used Google sign-in.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          For privacy questions, contact{" "}
          <a href="mailto:privacy@qship.dev">privacy@qship.dev</a>.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="qship-privacy-section">
      <h2>{title}</h2>
      <div className="qship-privacy-body">{children}</div>
    </section>
  );
}
