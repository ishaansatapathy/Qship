"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import "~/components/qship/qship.css";
import { QshipAuthScreen } from "~/components/qship/qship-auth-screen";

function SignInContent() {
  const searchParams = useSearchParams();
  const errorMessage = searchParams.get("error") ?? undefined;
  const nextPath = searchParams.get("next") ?? undefined;
  const pendingTwoFactorEmail =
    searchParams.get("2fa") === "1" ? (searchParams.get("email") ?? undefined) : undefined;

  return (
    <QshipAuthScreen
      errorMessage={errorMessage}
      nextPath={nextPath}
      pendingTwoFactorEmail={pendingTwoFactorEmail}
    />
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
