/**
 * notify-delivery.test.ts
 *
 * Tests for the Slack notify delivery logic:
 *   - simulated delivery (no SLACK_WEBHOOK_URL)
 *   - live delivery (SLACK_WEBHOOK_URL set, fetch succeeds)
 *   - error recovery (fetch throws, result.sent = false)
 *   - result metadata written via updateFeatureMetadata
 *   - activity appended via appendFeatureActivity
 *
 * All DB/fetch calls are mocked so no database connection is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock DB-bound helpers from feature-request so we stay unit-level
vi.mock("../feature-request", () => ({
  appendFeatureActivity: vi.fn().mockResolvedValue(undefined),
  updateFeatureMetadata: vi.fn().mockResolvedValue(undefined),
}));

import { appendFeatureActivity, updateFeatureMetadata } from "../feature-request";
import {
  buildFeatureRequestsUrl,
  notifySlackFeatureApproved,
  notifySlackFeatureShipped,
  parseSlackChannel,
} from "./notify";

// ── helpers ───────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
const ORIG_ENV = { ...process.env };

beforeEach(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV };
});

afterEach(() => {
  process.env = ORIG_ENV;
});

// ── parseSlackChannel (already tested but extend for edge cases) ───────────────

describe("parseSlackChannel", () => {
  it("extracts first #channel mention", () => {
    expect(parseSlackChannel("Notify #eng-deploy on ship")).toBe("#eng-deploy");
  });

  it("returns null for empty/null input", () => {
    expect(parseSlackChannel(null)).toBeNull();
    expect(parseSlackChannel("")).toBeNull();
  });

  it("returns null when no hash-channel present", () => {
    expect(parseSlackChannel("Send email to admins")).toBeNull();
  });
});

// ── buildFeatureRequestsUrl ───────────────────────────────────────────────────

describe("buildFeatureRequestsUrl", () => {
  it("encodes special characters in feature id", () => {
    process.env.CLIENT_URL = "https://app.qship.dev";
    const url = buildFeatureRequestsUrl("feat/needs+encoding");
    expect(url).toBe("https://app.qship.dev/requests?id=feat%2Fneeds%2Bencoding");
  });
});

// ── notifySlackFeatureApproved — simulated ────────────────────────────────────

describe("notifySlackFeatureApproved — simulated", () => {
  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("returns sent:true, simulated:true when no webhook configured", async () => {
    const result = await notifySlackFeatureApproved({
      featureId: "feat-001",
      featureTitle: "Dark mode",
      rawRequest: "Notify #product-shipping",
    });

    expect(result.sent).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.channel).toBe("#product-shipping");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("records simulation via updateFeatureMetadata", async () => {
    await notifySlackFeatureApproved({
      featureId: "feat-002",
      featureTitle: "Analytics",
    });

    expect(updateFeatureMetadata).toHaveBeenCalledWith(
      "feat-002",
      expect.objectContaining({
        lastSlackNotification: expect.objectContaining({
          event: "approved",
          sent: true,
          simulated: true,
        }),
      }),
    );
  });

  it("appends activity entry on simulated success", async () => {
    await notifySlackFeatureApproved({
      featureId: "feat-003",
      featureTitle: "Onboarding",
    });

    expect(appendFeatureActivity).toHaveBeenCalledWith(
      "feat-003",
      expect.objectContaining({
        kind: "status",
        actor: "system",
      }),
    );
  });
});

// ── notifySlackFeatureApproved — live ─────────────────────────────────────────

describe("notifySlackFeatureApproved — live", () => {
  beforeEach(() => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T00/B00/token";
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("ok") });
  });

  it("returns sent:true, simulated:false when fetch succeeds", async () => {
    const result = await notifySlackFeatureApproved({
      featureId: "feat-010",
      featureTitle: "Search",
    });

    expect(result.sent).toBe(true);
    expect(result.simulated).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T00/B00/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts JSON body including feature title", async () => {
    await notifySlackFeatureApproved({
      featureId: "feat-011",
      featureTitle: "Payments overhaul",
    });

    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse(call[1].body as string);
    expect(body.text).toContain("Payments overhaul");
  });

  it("includes PR URL in payload when provided", async () => {
    await notifySlackFeatureApproved({
      featureId: "feat-012",
      featureTitle: "Auth revamp",
      prUrl: "https://github.com/org/repo/pull/77",
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    const text = JSON.stringify(body);
    expect(text).toContain("pull/77");
  });
});

// ── notifySlackFeatureApproved — error recovery ───────────────────────────────

describe("notifySlackFeatureApproved — error recovery", () => {
  beforeEach(() => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T00/B00/token";
    mockFetch.mockRejectedValue(new Error("Network timeout"));
  });

  it("returns sent:false and captures error message on fetch failure", async () => {
    const result = await notifySlackFeatureApproved({
      featureId: "feat-020",
      featureTitle: "Failing notify",
    });

    expect(result.sent).toBe(false);
    expect(result.simulated).toBe(false);
    expect(result.error).toMatch(/Network timeout/);
  });

  it("still writes metadata and activity even on failure", async () => {
    await notifySlackFeatureApproved({
      featureId: "feat-021",
      featureTitle: "Failing notify 2",
    });

    expect(updateFeatureMetadata).toHaveBeenCalledWith(
      "feat-021",
      expect.objectContaining({
        lastSlackNotification: expect.objectContaining({ sent: false }),
      }),
    );
    expect(appendFeatureActivity).toHaveBeenCalledWith(
      "feat-021",
      expect.objectContaining({ title: "Slack notification failed" }),
    );
  });
});

// ── notifySlackFeatureShipped ─────────────────────────────────────────────────

describe("notifySlackFeatureShipped — simulated", () => {
  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("records event as shipped", async () => {
    await notifySlackFeatureShipped({
      featureId: "feat-030",
      featureTitle: "Feature X",
      rawRequest: "Notify #deploys",
    });

    expect(updateFeatureMetadata).toHaveBeenCalledWith(
      "feat-030",
      expect.objectContaining({
        lastSlackNotification: expect.objectContaining({ event: "shipped" }),
      }),
    );
  });

  it("appends shipped activity with rocket icon hint", async () => {
    await notifySlackFeatureShipped({ featureId: "feat-031", featureTitle: "Search v2" });

    const call = (appendFeatureActivity as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const payload = call[1] as { title: string };
    expect(payload.title).toContain("🚀");
  });
});
