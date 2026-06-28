"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QshipAuthScreen } from "./qship-auth-screen";
import { useQshipUser } from "~/components/app/use-qship-user";

type AuthMode = "sign-in" | "sign-up";

type AuthContextValue = {
  isAuthOpen: boolean;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useQshipAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useQshipAuth must be used within QshipAuthProvider");
  return ctx;
}

function QshipAuthProviderInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useQshipUser();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const errorMessage = searchParams.get("error") ?? undefined;
  const nextPath = searchParams.get("next") ?? undefined;

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      if (searchParams.get("hero") === "1" || searchParams.get("login") === "1") {
        router.replace("/inbox");
      }
      return;
    }
    if (searchParams.get("login") === "1") setOpen(true);
  }, [searchParams, user, isLoading, router]);

  const openAuth = useCallback((nextMode: AuthMode = "sign-in") => {
    setMode(nextMode);
    setOpen(true);
    window.scrollTo(0, 0);
  }, []);

  const closeAuth = useCallback(() => {
    setOpen(false);
    if (typeof window !== "undefined" && window.location.search) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("error") || url.searchParams.has("login") || url.searchParams.has("next")) {
        url.searchParams.delete("error");
        url.searchParams.delete("login");
        url.searchParams.delete("next");
        const next = url.pathname + (url.search || "") + url.hash;
        window.history.replaceState({}, "", next);
      }
    }
  }, []);

  const value = useMemo(
    () => ({ isAuthOpen: open, openAuth, closeAuth }),
    [open, openAuth, closeAuth],
  );

  if (open) {
    return (
      <AuthContext.Provider value={value}>
        <QshipAuthScreen mode={mode} errorMessage={errorMessage} nextPath={nextPath} onClose={closeAuth} />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function QshipAuthProvider({ children }: { children: ReactNode }) {
  return <QshipAuthProviderInner>{children}</QshipAuthProviderInner>;
}
