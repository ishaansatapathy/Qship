"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Qship app error:", error);
  }, [error]);

  return (
    <div className="qship-app-page" style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <div className="qship-rotator-bubble" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12, maxWidth: 420 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--qship-muted)" }}>
          This page hit an unexpected error. You can retry or return to your workspace.
        </p>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--qship-dim)" }}>Reference: {error.digest}</p>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="qship-btn-accent" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/requests" className="qship-btn-ghost" style={{ display: "inline-flex", alignItems: "center" }}>
            Go to Requests
          </Link>
        </div>
      </div>
    </div>
  );
}
