import { describe, expect, it } from "vitest";

import {
  buildTrustedOrigins,
  isCsrfExemptPath,
  isMutatingMethod,
  isTrustedOrigin,
  originFromReferer,
  validateMutatingRequest,
} from "./trusted-origin";

describe("buildTrustedOrigins", () => {
  it("deduplicates and normalizes trailing slashes", () => {
    const origins = buildTrustedOrigins({
      clientUrl: "https://app.example.com/",
      baseUrl: "https://api.example.com",
      betterAuthUrl: "https://app.example.com",
    });
    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("https://api.example.com");
    expect(origins.filter((o) => o === "https://app.example.com")).toHaveLength(1);
  });

  it("includes localhost defaults for development", () => {
    const origins = buildTrustedOrigins({});
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://localhost:8000");
  });
});

describe("isTrustedOrigin", () => {
  const trusted = ["https://qship.ishaandev.co.in", "http://localhost:3000"];

  it("accepts exact origin match", () => {
    expect(isTrustedOrigin("https://qship.ishaandev.co.in", trusted)).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isTrustedOrigin("https://evil.example.com", trusted)).toBe(false);
  });

  it("rejects missing origin", () => {
    expect(isTrustedOrigin(undefined, trusted)).toBe(false);
  });
});

describe("originFromReferer", () => {
  it("extracts origin from referer URL", () => {
    expect(originFromReferer("https://app.example.com/requests?id=1")).toBe(
      "https://app.example.com",
    );
  });

  it("returns null for invalid referer", () => {
    expect(originFromReferer("not-a-url")).toBeNull();
  });
});

describe("isCsrfExemptPath", () => {
  it("exempts GitHub webhooks", () => {
    expect(isCsrfExemptPath("/webhooks/github")).toBe(true);
  });

  it("exempts health probes", () => {
    expect(isCsrfExemptPath("/health")).toBe(true);
    expect(isCsrfExemptPath("/ready")).toBe(true);
  });

  it("does not exempt tRPC mutations", () => {
    expect(isCsrfExemptPath("/trpc/feature.approve")).toBe(false);
  });
});

describe("isMutatingMethod", () => {
  it("treats GET as safe", () => {
    expect(isMutatingMethod("GET")).toBe(false);
  });

  it("treats POST as mutating", () => {
    expect(isMutatingMethod("POST")).toBe(true);
  });
});

describe("validateMutatingRequest", () => {
  const trusted = ["http://localhost:3000"];

  it("allows safe methods without CSRF", () => {
    expect(
      validateMutatingRequest({
        method: "GET",
        path: "/trpc/feature.list",
        trustedOrigins: trusted,
      }),
    ).toEqual({ ok: true, via: "safe_method" });
  });

  it("allows webhook posts without origin", () => {
    expect(
      validateMutatingRequest({
        method: "POST",
        path: "/webhooks/github",
        trustedOrigins: trusted,
      }),
    ).toEqual({ ok: true, via: "exempt_path" });
  });

  it("allows bearer-authenticated MCP calls", () => {
    expect(
      validateMutatingRequest({
        method: "POST",
        path: "/mcp",
        authorization: "Bearer shipflow-key",
        trustedOrigins: trusted,
      }),
    ).toEqual({ ok: true, via: "bearer" });
  });

  it("allows web proxy CSRF header", () => {
    expect(
      validateMutatingRequest({
        method: "POST",
        path: "/trpc/feature.approve",
        csrfHeader: "1",
        trustedOrigins: trusted,
      }),
    ).toEqual({ ok: true, via: "csrf_header" });
  });

  it("allows trusted origin on mutations", () => {
    expect(
      validateMutatingRequest({
        method: "POST",
        path: "/api/feature/requests/abc/approve",
        origin: "http://localhost:3000",
        trustedOrigins: trusted,
      }),
    ).toEqual({ ok: true, via: "trusted_origin" });
  });

  it("blocks untrusted cross-site mutations", () => {
    const result = validateMutatingRequest({
      method: "POST",
      path: "/trpc/feature.approve",
      origin: "https://attacker.example",
      trustedOrigins: trusted,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Cross-site request blocked");
    }
  });
});
