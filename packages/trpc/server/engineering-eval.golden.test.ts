import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateOpenApiDocument } from "trpc-to-openapi";

import { openApiRouter, serverRouter } from "./index";

/** Labeled invariants for tRPC monorepo & engineering quality (see AI_EVAL.md §5). */
export const ENGINEERING_EVAL_INVARIANTS = [
  "turborepo_monorepo_layout",
  "trpc_v11_shared_package",
  "openapi_router_excludes_legacy_stubs",
  "openapi_document_generates",
  "scalar_docs_mount_when_enabled",
  "core_mutations_use_mutation_procedure",
  "drizzle_migrations_51_plus",
  "performance_indexes_migration_0041",
  "ci_static_analysis_gate",
  "ci_unit_and_build_gate",
  "ci_engineering_eval_gate",
  "ci_api_smoke_openapi_docs",
  "playwright_e2e_demo_spec",
  "web_no_direct_database_imports",
  "global_rate_limit_docs_exempt",
] as const;

export const ENGINEERING_EVAL_INVARIANT_COUNT = ENGINEERING_EVAL_INVARIANTS.length;

const repoRoot = path.resolve(__dirname, "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
      listSourceFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("engineering quality eval harness", () => {
  it(`documents ${ENGINEERING_EVAL_INVARIANT_COUNT} engineering invariants`, () => {
    expect(ENGINEERING_EVAL_INVARIANT_COUNT).toBe(15);
  });

  it("uses Turborepo monorepo with apps and shared packages", () => {
    expect(readRepo("turbo.json")).toContain('"tasks"');
    expect(readRepo("pnpm-workspace.yaml")).toContain("apps/*");
    expect(readRepo("pnpm-workspace.yaml")).toContain("packages/*");
    for (const dir of ["apps/web", "apps/api", "packages/trpc", "packages/services", "packages/database"]) {
      expect(statSync(path.join(repoRoot, dir)).isDirectory()).toBe(true);
    }
  });

  it("pins tRPC v11 in the shared router package", () => {
    const pkg = JSON.parse(readRepo("packages/trpc/package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@trpc/server"]).toMatch(/^(\^|~)?11\./);
    expect(pkg.dependencies["trpc-to-openapi"]).toBeTruthy();
  });

  it("exposes production OpenAPI router without legacy Gmail/calendar stubs", () => {
    const indexSrc = readRepo("packages/trpc/server/index.ts");
    expect(indexSrc).toContain("export const openApiRouter = router({");
    expect(indexSrc).not.toMatch(/openApiRouter[\s\S]*inboxRouter/);

    const serverKeys = Object.keys(serverRouter._def.procedures);
    const openApiKeys = Object.keys(openApiRouter._def.procedures);
    expect(serverKeys.some((key) => key.startsWith("feature."))).toBe(true);
    expect(serverKeys.some((key) => key.startsWith("inbox."))).toBe(true);
    expect(openApiKeys.some((key) => key.startsWith("feature."))).toBe(true);
    expect(openApiKeys.some((key) => key.startsWith("inbox."))).toBe(false);
    expect(openApiKeys.some((key) => key.startsWith("calendar."))).toBe(false);
  });

  it("generates OpenAPI 3.x from tRPC procedures", () => {
    const doc = generateOpenApiDocument(openApiRouter, {
      title: "ShipFlow API",
      version: "1.0.0",
      baseUrl: "http://localhost:8000/api",
    });
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(10);
    expect(doc.paths?.["/feature/requests"]?.get).toBeTruthy();
  });

  it("mounts Scalar at /docs when PUBLIC_OPENAPI_DOCS is enabled", () => {
    const serverSrc = readRepo("apps/api/src/server.ts");
    expect(serverSrc).toContain('env.PUBLIC_OPENAPI_DOCS === "true"');
    expect(serverSrc).toContain('"/docs"');
    expect(serverSrc).toContain("apiReference");
    expect(serverSrc).toContain('app.get("/openapi.json"');
  });

  it("requires mutationProcedure on core state-changing tRPC routes", () => {
    const coreRoutes = [
      "packages/trpc/server/routes/feature/route.ts",
      "packages/trpc/server/routes/github/route.ts",
      "packages/trpc/server/routes/agent/route.ts",
      "packages/trpc/server/routes/billing/route.ts",
    ];
    for (const routePath of coreRoutes) {
      const src = readRepo(routePath);
      expect(src).not.toMatch(/protectedProcedure[\s\S]{0,240}?\.mutation\(/);
    }
  });

  it("tracks 51+ Drizzle migrations", () => {
    const journal = JSON.parse(readRepo("packages/database/drizzle/meta/_journal.json")) as {
      entries: unknown[];
    };
    expect(journal.entries.length).toBeGreaterThanOrEqual(51);
  });

  it("adds performance indexes in migration 0041", () => {
    const migration = readRepo("packages/database/drizzle/0041_add_indexes.sql");
    const indexCount = (migration.match(/CREATE (UNIQUE )?INDEX/gi) ?? []).length;
    expect(indexCount).toBeGreaterThanOrEqual(14);
  });

  it("runs static analysis and engineering eval in CI", () => {
    const ci = readRepo(".github/workflows/ci.yml");
    expect(ci).toContain("pnpm check-types");
    expect(ci).toContain("pnpm lint");
    expect(ci).toContain("pnpm test");
    expect(ci).toContain("test:engineering-eval");
    expect(ci).toContain("PUBLIC_OPENAPI_DOCS");
    expect(ci).toContain("/docs");
    expect(ci).toContain("test:e2e");
  });

  it("includes Playwright demo journey spec", () => {
    const spec = readRepo("apps/web/e2e/shipflow-demo.spec.ts");
    expect(spec).toContain("ShipFlow demo journey");
    expect(spec).toContain("demoLogin");
  });

  it("keeps Next.js web layer off direct database imports", () => {
    const webRoot = path.join(repoRoot, "apps/web");
    const offenders = listSourceFiles(webRoot).filter((file) => {
      if (file.includes(`${path.sep}node_modules${path.sep}`)) return false;
      const src = readFileSync(file, "utf8");
      return /from ["']@repo\/database/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("exempts public API docs, tRPC transport, and agent SSE from global rate limiting", () => {
    const limiter = readRepo("apps/api/src/middleware/rate-limiters.ts");
    expect(limiter).toContain("isGlobalRateLimitExempt");
    expect(limiter).toContain('path === "/openapi.json"');
    expect(limiter).toContain('path.startsWith("/docs/")');
    expect(limiter).toContain('path.startsWith("/trpc/")');
    expect(limiter).toContain('path === "/agent/stream"');
  });
});
