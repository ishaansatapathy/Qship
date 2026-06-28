/**
 * Trusted-origin and CSRF validation for mutating HTTP requests.
 * Pure functions — unit-tested and reused by the Express middleware layer.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Paths that skip CSRF/origin checks (webhooks, health probes, Inngest). */
const CSRF_EXEMPT_PREFIXES = [
  "/webhooks/",
  "/health",
  "/ready",
  "/api/inngest",
] as const;

export type MutatingRequestValidationInput = {
  method: string;
  path: string;
  origin?: string | null;
  referer?: string | null;
  csrfHeader?: string | null;
  authorization?: string | null;
  trustedOrigins: string[];
};

export type MutatingRequestValidationResult =
  | { ok: true; via: "safe_method" | "exempt_path" | "bearer" | "csrf_header" | "trusted_origin" }
  | { ok: false; reason: string };

/** Builds the deduplicated list of trusted origins from environment URLs. */
export function buildTrustedOrigins(input: {
  clientUrl?: string | null;
  baseUrl?: string | null;
  betterAuthUrl?: string | null;
  extra?: string[];
}): string[] {
  const normalize = (value: string) => value.trim().replace(/\/$/, "");
  const candidates = [
    input.clientUrl,
    input.baseUrl,
    input.betterAuthUrl,
    ...(input.extra ?? []),
    "http://localhost:3000",
    "http://localhost:8000",
  ]
    .filter((v): v is string => Boolean(v?.trim()))
    .map(normalize);

  return [...new Set(candidates)];
}

export function isTrustedOrigin(origin: string | null | undefined, trustedOrigins: string[]): boolean {
  if (!origin?.trim()) return false;
  const normalized = origin.trim().replace(/\/$/, "");
  return trustedOrigins.some((trusted) => normalized === trusted || normalized.startsWith(`${trusted}/`));
}

export function originFromReferer(referer: string | null | undefined): string | null {
  if (!referer?.trim()) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isCsrfExemptPath(path: string): boolean {
  const normalized = path.split("?")[0] ?? path;
  return CSRF_EXEMPT_PREFIXES.some(
    (prefix) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix),
  );
}

/** Returns true when the HTTP method can mutate server state. */
export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Validates CSRF / trusted-origin requirements for state-changing requests.
 * Bearer-authenticated clients (MCP, scripts) bypass origin checks.
 */
export function validateMutatingRequest(
  input: MutatingRequestValidationInput,
): MutatingRequestValidationResult {
  const method = input.method.toUpperCase();

  if (!isMutatingMethod(method)) {
    return { ok: true, via: "safe_method" };
  }

  if (isCsrfExemptPath(input.path)) {
    return { ok: true, via: "exempt_path" };
  }

  if (input.authorization?.trim().toLowerCase().startsWith("bearer ")) {
    return { ok: true, via: "bearer" };
  }

  if (input.csrfHeader === "1") {
    return { ok: true, via: "csrf_header" };
  }

  const origin = input.origin ?? originFromReferer(input.referer);
  if (isTrustedOrigin(origin, input.trustedOrigins)) {
    return { ok: true, via: "trusted_origin" };
  }

  return {
    ok: false,
    reason: "Cross-site request blocked — missing trusted origin or x-app-csrf header.",
  };
}
