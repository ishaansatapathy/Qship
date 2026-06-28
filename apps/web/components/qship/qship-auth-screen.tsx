"use client";

import { useState } from "react";
import Link from "next/link";
import { QshipAuthCard } from "./qship-auth-card";
import { useQshipUser } from "~/components/app/use-qship-user";
import { signOutShipflow } from "~/lib/sign-out";

type AuthMode = "sign-in" | "sign-up";

type QshipAuthScreenProps = {
  mode?: AuthMode;
  errorMessage?: string;
  nextPath?: string;
  pendingTwoFactorEmail?: string;
  onClose?: () => void;
};

export function QshipAuthScreen({
  mode: initialMode = "sign-in",
  errorMessage,
  nextPath,
  onClose,
}: QshipAuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const { user } = useQshipUser();

  const brand = onClose ? (
    <button type="button" className="qship-auth-screen-brand" onClick={onClose}>
      ShipFlow
    </button>
  ) : (
    <Link href="/" className="qship-auth-screen-brand">
      ShipFlow
    </Link>
  );

  return (
    <div className="qship-page qship-auth-screen">
      <header className="qship-auth-screen-nav">
        <div className="qship-auth-screen-nav-inner">{brand}</div>
      </header>

      <main className="qship-auth-screen-main">
        {user ? (
          <p className="qship-auth-demo-link" style={{ marginBottom: 16, textAlign: "center" }}>
            Signed in as <strong>{user.displayName || user.email}</strong>.{" "}
            <button
              type="button"
              className="qship-auth-switch-btn"
              onClick={() => void signOutShipflow("/sign-in")}
            >
              Sign out
            </button>{" "}
            to use Google, GitHub, or another account.
          </p>
        ) : null}
        <QshipAuthCard
          mode={mode}
          onModeChange={setMode}
          errorMessage={errorMessage}
          nextPath={nextPath}
        />
      </main>
    </div>
  );
}
