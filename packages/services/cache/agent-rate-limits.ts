/** Shared per-user agent rate limits (SSE + tRPC chat). */
export const AGENT_USER_RATE_LIMIT = {
  limit: 40,
  windowMs: 60_000,
} as const;
