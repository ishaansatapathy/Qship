"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Same login UI as landing — avoid a separate bare /sign-in page. */
function SignInRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("login", "1");
    for (const key of ["error", "next", "email", "2fa"] as const) {
      const value = searchParams.get(key);
      if (value) url.searchParams.set(key, value);
    }
    router.replace(`${url.pathname}${url.search}`);
  }, [router, searchParams]);

  return null;
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInRedirect />
    </Suspense>
  );
}
