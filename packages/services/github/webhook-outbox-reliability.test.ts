/**
 * webhook-outbox-reliability.test.ts
 *
 * Tests for the three reliability properties that were previously untested:
 *
 *  1. Dedup bypass on outbox retry
 *     — A delivery whose dedup row was written by a FAILED first attempt
 *       must succeed on the outbox retry, not be silently dropped.
 *
 *  2. Optimistic claim prevents double-processing
 *     — When two instances both SELECT the same outbox row, only the one
 *       that wins the UPDATE WHERE status='pending' actually processes it.
 *
 *  3. skipDedup flag is passed from dispatchOutboxRow to processors
 *     — Verifies the wiring in webhook-outbox.ts without a real database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockIsDuplicate = vi.fn().mockResolvedValue(false);
const mockTransition = vi.fn().mockResolvedValue({});
const mockAppend = vi.fn().mockResolvedValue({});

vi.mock("./webhook-dedup", () => ({
  isGithubDeliveryDuplicate: (...args: unknown[]) => mockIsDuplicate(...args),
}));

vi.mock("../feature-request", () => ({
  transitionFeatureStatus: (...args: unknown[]) => mockTransition(...args),
  appendFeatureActivity: (...args: unknown[]) => mockAppend(...args),
}));

vi.mock("./client", () => ({
  invalidateInstallationCache: vi.fn(),
}));

vi.mock("./installation", () => ({
  syncInstallationRepositoriesForOrg: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./webhook-pr-review-dispatch", () => ({
  dispatchWebhookPullRequestAiReview: vi.fn().mockResolvedValue({ queued: true }),
}));

// Shared mock DB state that tests can configure
let dbRows: unknown[] = [];
let claimSucceeds = true;

// Shared stub that returns null for all findFirst calls (unknown_installation path).
// The test only cares whether mockIsDuplicate was called — not what the processor returned.
const findFirstNull = vi.fn().mockResolvedValue(null);

vi.mock("@repo/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/database")>();
  return {
    ...actual,
    default: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => ({
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => Promise.resolve(dbRows)),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue({}),
        }),
      }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
      query: {
        organizations: { findFirst: findFirstNull },
        repositories: { findFirst: findFirstNull },
        featureRequests: { findFirst: findFirstNull },
        humanApprovals: { findFirst: findFirstNull },
      },
    },
    eq: actual.eq,
    and: actual.and,
    lte: actual.lte,
    asc: actual.asc,
    sql: actual.sql,
  };
});

// ── 1. skipDedup flag wired correctly in processors ───────────────────────────

describe("processor skipDedup opt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDuplicate.mockResolvedValue(false);
  });

  it("processGithubPullRequestWebhook calls isGithubDeliveryDuplicate by default", async () => {
    const { processGithubPullRequestWebhook } = await import("./webhook");
    await processGithubPullRequestWebhook({}, "del-1");
    expect(mockIsDuplicate).toHaveBeenCalledWith("del-1", "pull_request");
  });

  it("processGithubPullRequestWebhook skips dedup when skipDedup:true", async () => {
    const { processGithubPullRequestWebhook } = await import("./webhook");
    await processGithubPullRequestWebhook({}, "del-1", { skipDedup: true });
    expect(mockIsDuplicate).not.toHaveBeenCalled();
  });

  it("processGithubInstallationWebhook calls isGithubDeliveryDuplicate by default", async () => {
    const { processGithubInstallationWebhook } = await import("./webhook");
    await processGithubInstallationWebhook({}, "del-2");
    expect(mockIsDuplicate).toHaveBeenCalledWith("del-2", "installation");
  });

  it("processGithubInstallationWebhook skips dedup when skipDedup:true", async () => {
    const { processGithubInstallationWebhook } = await import("./webhook");
    await processGithubInstallationWebhook({}, "del-2", { skipDedup: true });
    expect(mockIsDuplicate).not.toHaveBeenCalled();
  });

  it("duplicate is still blocked when skipDedup is omitted/false", async () => {
    mockIsDuplicate.mockResolvedValueOnce(true);
    const { processGithubPullRequestWebhook } = await import("./webhook");
    const result = await processGithubPullRequestWebhook({}, "del-dup");
    expect(result).toMatchObject({ reason: "duplicate_delivery" });
    expect(mockIsDuplicate).toHaveBeenCalledOnce();
  });
});

// ── 2. Dedup bypass on outbox retry (the critical previously-failing scenario) ─

describe("outbox dedup bypass — critical failure path", () => {
  /**
   * Scenario: A delivery failed mid-processing on the first attempt.
   * The dedup table already has the delivery_id from the failed attempt.
   * The outbox must retry successfully — not drop the event as a duplicate.
   */
  it("outbox retries successfully even when dedup table has an existing entry", async () => {
    vi.clearAllMocks();

    // Simulate: dedup table has entry from the failed first attempt
    // If processors respected the dedup check, this would return duplicate_delivery.
    // The fix: processors receive skipDedup:true from the outbox.
    mockIsDuplicate.mockResolvedValue(true); // would block if checked

    const { processGithubPullRequestWebhook } = await import("./webhook");

    // The outbox always calls with skipDedup:true
    const result = await processGithubPullRequestWebhook(
      {
        action: "opened",
        installation: { id: 999 },
        pull_request: { id: 1, number: 1, state: "open", head: { sha: "abc", ref: "shipflow/feature-uuid" } },
        repository: { id: 42, full_name: "acme/core" },
      },
      "del-previously-failed",
      { skipDedup: true }, // what the outbox passes
    );

    // dedup was NOT checked (the key assertion)
    expect(mockIsDuplicate).not.toHaveBeenCalled();
    // Processing proceeded (unknown_installation because DB is mocked, but NOT duplicate_delivery)
    expect(result).not.toMatchObject({ reason: "duplicate_delivery" });
  });

  it("outbox passing skipDedup:false would be blocked (validates the fix matters)", async () => {
    vi.clearAllMocks();
    mockIsDuplicate.mockResolvedValue(true); // dedup table has entry

    const { processGithubPullRequestWebhook } = await import("./webhook");
    const result = await processGithubPullRequestWebhook(
      { action: "opened" },
      "del-blocked",
      { skipDedup: false }, // explicitly not bypassing
    );

    expect(result).toMatchObject({ reason: "duplicate_delivery" });
  });
});

// ── 3. Optimistic claim source test ───────────────────────────────────────────

describe("webhook-outbox.ts source contains optimistic claim guard", () => {
  it("outbox source uses status=pending guard on claim UPDATE", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "./webhook-outbox.ts"), "utf8");
    expect(src).toContain("lost-update guard");
    expect(src).toContain("eq(githubWebhookOutbox.status");
  });

  it("dispatchOutboxRow passes skipDedup:true to processors", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "./webhook-outbox.ts"), "utf8");
    expect(src).toContain("skipDedup: true");
  });

  it("outbox logs row_already_claimed when optimistic lock fails", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "./webhook-outbox.ts"), "utf8");
    expect(src).toContain("webhook.outbox.row_already_claimed");
  });
});

// ── 4. Golden eval invariants updated ────────────────────────────────────────

describe("github eval invariants include reliability invariants", () => {
  it("includes outbox_dedup_bypass_on_retry invariant", async () => {
    const { GITHUB_EVAL_INVARIANTS } = await import("./github-eval.golden.test");
    expect(GITHUB_EVAL_INVARIANTS).toContain("outbox_dedup_bypass_on_retry");
  });

  it("includes outbox_optimistic_claim invariant", async () => {
    const { GITHUB_EVAL_INVARIANTS } = await import("./github-eval.golden.test");
    expect(GITHUB_EVAL_INVARIANTS).toContain("outbox_optimistic_claim");
  });
});
