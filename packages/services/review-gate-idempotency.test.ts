import { describe, expect, it, vi } from "vitest";

import { ServiceError } from "./errors";

vi.mock("@repo/database", () => ({
  default: {
    query: {
      humanApprovals: { findFirst: vi.fn() },
    },
  },
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  desc: (v: unknown) => v,
}));

vi.mock("@repo/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import db from "@repo/database";
import { resolveIdempotentApprovedDecision } from "./review-gate";

describe("resolveIdempotentApprovedDecision", () => {
  it("returns existing approval when present", async () => {
    vi.mocked(db.query.humanApprovals.findFirst).mockResolvedValueOnce({
      id: "approval-1",
      decision: "approved",
    } as never);

    const result = await resolveIdempotentApprovedDecision("feat-1");
    expect(result).toMatchObject({
      id: "approval-1",
      idempotent: true,
      nextStatus: "approved",
    });
  });

  it("throws CONFLICT when approved status has no audit row", async () => {
    vi.mocked(db.query.humanApprovals.findFirst).mockResolvedValueOnce(undefined);

    await expect(resolveIdempotentApprovedDecision("feat-orphan")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
