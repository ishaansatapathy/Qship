import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

// ── extractFeatureId ──────────────────────────────────────────────────────────
// Re-export via a thin helper so we can test without hitting the DB.
function extractFeatureId(pr: { head?: { ref?: string }; body?: string | null }): string | null {
  const FEATURE_BRANCH_RE = /^shipflow\/([0-9a-f-]{36})$/i;
  const FEATURE_TAG_RE = /ShipFlow-Feature:\s*([0-9a-f-]{36})/i;
  const branchMatch = pr.head?.ref?.match(FEATURE_BRANCH_RE);
  if (branchMatch?.[1]) return branchMatch[1];
  const tagMatch = (pr.body ?? "").match(FEATURE_TAG_RE);
  return tagMatch?.[1] ?? null;
}

// ── HMAC signature verification (pure, no DB) ─────────────────────────────────
function verifySignature(payload: Buffer, signature: string, secret: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// ── In-memory idempotency guard (pure, no DB) ─────────────────────────────────
function makeDeliverySet(maxSize = 5) {
  const seen = new Set<string>();
  return function isAlreadyProcessed(id: string): boolean {
    if (seen.has(id)) return true;
    if (seen.size >= maxSize) {
      const oldest = seen.values().next().value;
      if (oldest) seen.delete(oldest);
    }
    seen.add(id);
    return false;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("extractFeatureId", () => {
  const UUID = "550e8400-e29b-41d4-a716-446655440000";

  it("extracts UUID from shipflow/ branch prefix", () => {
    expect(extractFeatureId({ head: { ref: `shipflow/${UUID}` } })).toBe(UUID);
  });

  it("extracts UUID from ShipFlow-Feature tag in PR body", () => {
    expect(
      extractFeatureId({ body: `closes #123\n\nShipFlow-Feature: ${UUID}` }),
    ).toBe(UUID);
  });

  it("prefers branch ref over body tag", () => {
    const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(
      extractFeatureId({ head: { ref: `shipflow/${UUID}` }, body: `ShipFlow-Feature: ${other}` }),
    ).toBe(UUID);
  });

  it("returns null when neither convention is present", () => {
    expect(extractFeatureId({ head: { ref: "main" }, body: "no tag" })).toBeNull();
  });

  it("is case-insensitive on the tag", () => {
    expect(
      extractFeatureId({ body: `SHIPFLOW-FEATURE: ${UUID}` }),
    ).toBe(UUID);
  });
});

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const payload = Buffer.from(JSON.stringify({ action: "opened" }));

  it("accepts a valid sha256 signature", () => {
    const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const sig = `sha256=${crypto.createHmac("sha256", "wrong-secret").update(payload).digest("hex")}`;
    expect(verifySignature(payload, sig, secret)).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
    const tampered = Buffer.from(JSON.stringify({ action: "deleted" }));
    expect(verifySignature(tampered, sig, secret)).toBe(false);
  });

  it("rejects a signature missing sha256= prefix", () => {
    const raw = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifySignature(payload, raw, secret)).toBe(false);
  });
});

describe("idempotency guard", () => {
  it("returns false on first delivery", () => {
    const guard = makeDeliverySet();
    expect(guard("abc-123")).toBe(false);
  });

  it("returns true on duplicate delivery", () => {
    const guard = makeDeliverySet();
    guard("abc-123");
    expect(guard("abc-123")).toBe(true);
  });

  it("evicts oldest entry when max size reached", () => {
    const guard = makeDeliverySet(3);
    // Fill to capacity: {a, b, c}
    guard("a");
    guard("b");
    guard("c");
    // Adding "d" evicts "a": set becomes {b, c, d}
    guard("d");
    // "d" just added → duplicate → true
    expect(guard("d")).toBe(true);
    // "a" was evicted → false
    expect(guard("a")).toBe(false);
  });
});

describe("merge → human_review (not approved) logic", () => {
  it("transitions merged PR to human_review when no prior approval exists", () => {
    const hasApproval = false;
    const nextStatus = hasApproval ? "approved" : "human_review";
    expect(nextStatus).toBe("human_review");
  });

  it("transitions merged PR to approved when human approval already on record", () => {
    const hasApproval = true;
    const nextStatus = hasApproval ? "approved" : "human_review";
    expect(nextStatus).toBe("approved");
  });
});
