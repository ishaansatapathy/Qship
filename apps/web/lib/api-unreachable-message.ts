/** User-facing copy when the Next.js tRPC proxy cannot reach the Express API. */
export function getApiUnreachableMessage(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return "Could not reach the Qship API. Wait a few seconds and try again — the backend may be waking up.";
    }
  }
  return "API unavailable — run pnpm dev from the repo root (starts web + API on port 8000), then refresh.";
}

/** Prefer the server tRPC message; fall back to wake-up copy for network/proxy failures. */
export function formatTrpcQueryError(
  errors: Array<{ message?: string } | null | undefined>,
): string {
  for (const error of errors) {
    const message = error?.message?.trim();
    if (!message) continue;
    const lower = message.toLowerCase();
    if (
      lower.includes("failed to fetch") ||
      lower.includes("network") ||
      lower.includes("timeout") ||
      lower.includes("503") ||
      lower.includes("waking up")
    ) {
      continue;
    }
    return message;
  }
  return getApiUnreachableMessage();
}

export function isLikelyLocalDev(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}
