/** User-facing copy when the Next.js tRPC proxy cannot reach the Express API. */
export function getApiUnreachableMessage(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return "Could not reach the ShipFlow API. Wait a few seconds and try again — the backend may be waking up.";
    }
  }
  return "API unavailable — run pnpm dev from the repo root (starts web + API on port 8000), then refresh.";
}

export function isLikelyLocalDev(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}
