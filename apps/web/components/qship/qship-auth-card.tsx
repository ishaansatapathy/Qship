"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "~/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

type AuthProvider = {
  provider: "EMAIL" | "GOOGLE_OAUTH" | "GITHUB_OAUTH";
  enabled: boolean;
};

type QshipAuthCardProps = {
  mode: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  nextPath?: string;
  errorMessage?: string;
};

export function QshipAuthCard({
  mode,
  onModeChange,
  nextPath = "/inbox",
  errorMessage,
}: QshipAuthCardProps) {
  const router = useRouter();
  const isLogin = mode === "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  useEffect(() => {
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: AuthProvider[]) => setProviders(Array.isArray(data) ? data : []))
      .catch(() => setProviders([]));
  }, []);

  const googleEnabled =
    isLogin &&
    (providers.some((provider) => provider.provider === "GOOGLE_OAUTH" && provider.enabled) ||
      providers.length === 0);
  const githubEnabled = false;

  const OAUTH_ERROR_MESSAGES: Record<string, string> = {
    state_mismatch:
      "Sign-in session expired or the link was opened in a different browser tab. Please try again.",
    email_not_found:
      "No Qship account is linked to this GitHub email. Please sign up with email first, then connect GitHub from Settings.",
    user_not_found:
      "No account found. Please sign up first.",
    account_not_linked:
      "This social account is not linked to any Qship account.",
    email_not_verified:
      "Please verify your email address before signing in.",
    invalid_credentials:
      "Incorrect email or password.",
    too_many_requests:
      "Too many sign-in attempts. Please wait a moment and try again.",
  };

  const resolvedError =
    errorMessage && OAUTH_ERROR_MESSAGES[errorMessage]
      ? OAUTH_ERROR_MESSAGES[errorMessage]
      : errorMessage;

  const displayError = localError ?? resolvedError ?? null;

  async function handleSocialSignIn(provider: "google" | "github") {
    setLocalError(null);
    setLoading(true);

    try {
      const absoluteCallbackURL =
        typeof window !== "undefined"
          ? `${window.location.origin}${nextPath}`
          : nextPath;

      await authClient.signIn.social({
        provider,
        callbackURL: absoluteCallbackURL,
        errorCallbackURL:
          typeof window !== "undefined"
            ? `${window.location.origin}/?login=1`
            : "/?login=1",
      });
    } catch {
      setLocalError("Social sign-in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) {
          setLocalError(result.error.message ?? "Sign in failed");
          return;
        }
      } else {
        const result = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.split("@")[0] || "Qship User",
        });
        if (result.error) {
          setLocalError(result.error.message ?? "Sign up failed");
          return;
        }
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setLocalError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="qship-auth-card">
      <div className="qship-auth-card-header">
        <h1 className="qship-auth-title">
          {isLogin ? "Sign in" : "Create account"}
        </h1>
        <p className="qship-auth-subtitle">
          {isLogin
            ? "Welcome back. Enter your credentials to continue."
            : "Get started with Qship in under a minute."}
        </p>
      </div>

      {displayError ? <p className="qship-auth-error">{displayError}</p> : null}

      {isLogin && (googleEnabled || githubEnabled) ? (
        <div className="qship-auth-social-stack">
          {googleEnabled ? (
            <button
              type="button"
              className="qship-auth-social-outline"
              disabled={loading}
              onClick={() => void handleSocialSignIn("google")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          ) : null}

          {githubEnabled ? (
            <button
              type="button"
              className="qship-auth-social-outline"
              disabled={loading}
              onClick={() => void handleSocialSignIn("github")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          ) : null}

          <div className="qship-auth-divider">
            <span>or</span>
          </div>
        </div>
      ) : null}

      <form className="qship-auth-form" onSubmit={handleSubmit}>
        {!isLogin ? (
          <label className="qship-auth-field">
            <span className="qship-auth-label">Name</span>
            <input
              className="qship-auth-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
            />
          </label>
        ) : null}

        <label className="qship-auth-field">
          <span className="qship-auth-label">Email</span>
          <input
            className="qship-auth-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </label>

        <label className="qship-auth-field">
          <span className="qship-auth-label">Password</span>
          <input
            className="qship-auth-input"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>

        <button type="submit" className="qship-auth-submit" disabled={loading}>
          {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      {isLogin ? (
        <Link href={`/api-auth/demo?next=${encodeURIComponent(nextPath)}`} className="qship-auth-demo-link">
          Try demo account
        </Link>
      ) : null}

      <p className="qship-auth-switch">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="qship-auth-switch-btn"
          onClick={() => onModeChange?.(isLogin ? "sign-up" : "sign-in")}
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
