"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";

import "~/components/qship/qship.css";
import { QshipLogoMark, QshipWordmark } from "~/components/qship/qship-logo";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() || "your inbox";

  return (
    <div className="qship-page qship-auth-page">
      <header className="qship-auth-page-header">
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <QshipLogoMark size={26} />
          <QshipWordmark size="sm" />
        </Link>
      </header>
      <main className="qship-auth-page-main">
        <div className="thread-check-email">
          <QshipLogoMark size={44} />
          <div
            style={{
              margin: "20px auto 0",
              width: 52,
              height: 52,
              borderRadius: 12,
              border: "1px solid var(--qship-line)",
              display: "grid",
              placeItems: "center",
              color: "var(--qship-accent-bright)",
            }}
          >
            <Mail size={22} />
          </div>
          <h1>Check your email</h1>
          <p>
            We sent a verification link to <strong>{email}</strong>. Open it to finish setting up Thread.
          </p>
          <p style={{ marginTop: 16 }}>
            <Link href="/sign-in" className="qship-btn-ghost" style={{ display: "inline-flex", textDecoration: "none" }}>
              Back to log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
