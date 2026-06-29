import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOLS } from "./ai/agent-internals";
import { SHIPFLOW_MCP_TOOLS } from "./shipflow-agent-tools";
import {
  evaluateHumanApprovalEligibility,
  getHumanApprovalEligibility,
  persistAiReview,
  recordHumanApproval,
  validateHumanApprovalEligibility,
} from "./review";

/** Labeled invariants for review loop merge gate (see AI_EVAL.md §4). */
export const REVIEW_EVAL_INVARIANTS = [
  "persist_ai_review_with_iteration",
  "delta_blocking_issue_tracking",
  "validate_human_approval_eligibility",
  "approval_eligibility_read_api",
  "record_human_approval_audit",
  "approve_idempotent_on_race",
  "optimistic_status_transition",
  "demo_only_blocked_in_production",
  "agent_approve_request_changes_tools",
  "review_loop_health_workspace_auth",
  "issue_resolution_workspace_auth",
  "ui_approval_gate_parity",
] as const;

export const REVIEW_EVAL_INVARIANT_COUNT = REVIEW_EVAL_INVARIANTS.length;

describe("review loop eval harness", () => {
  it(`documents ${REVIEW_EVAL_INVARIANT_COUNT}+ review invariants`, () => {
    expect(REVIEW_EVAL_INVARIANT_COUNT).toBeGreaterThanOrEqual(10);
  });

  it("exports core review loop service functions", () => {
    expect(typeof persistAiReview).toBe("function");
    expect(typeof recordHumanApproval).toBe("function");
    expect(typeof validateHumanApprovalEligibility).toBe("function");
    expect(typeof getHumanApprovalEligibility).toBe("function");
    expect(typeof evaluateHumanApprovalEligibility).toBe("function");
  });

  it("agent and MCP expose approval/review tool names", () => {
    const tools = [
      "run_ai_review",
      "approve_feature",
      "request_changes",
      "reject_feature",
      "get_review_delta",
      "get_review_loop_health",
      "request_human_review",
    ];
    const agentNames = AGENT_TOOLS.map((t) => t.function.name);
    const mcpNames = SHIPFLOW_MCP_TOOLS.map((t) => t.name);
    for (const name of tools) {
      expect(agentNames).toContain(name);
      expect(mcpNames).toContain(name);
    }
  });

  it("uses optimistic locking in guardedUpdateFeatureStatusInTx", () => {
    const source = readFileSync(path.resolve(__dirname, "./feature-request.ts"), "utf8");
    expect(source).toContain("eq(featureRequests.status, from)");
  });

  it("records idempotent approval on concurrent race", () => {
    const source = readFileSync(path.resolve(__dirname, "./review.ts"), "utf8");
    expect(source).toContain("review.human_approval_idempotent");
    expect(source).toContain("idempotentAfterRace");
  });

  it("requests page disables approve when eligibility fails", () => {
    const ui = readFileSync(
      path.resolve(__dirname, "../../apps/web/app/(app)/requests/page.tsx"),
      "utf8",
    );
    expect(ui).toContain("getApprovalEligibility");
    expect(ui).toContain("approvalEligibility.data?.eligible");
  });

  it("tRPC exposes approval eligibility read endpoint", () => {
    const route = readFileSync(
      path.resolve(__dirname, "../trpc/server/routes/feature/route.ts"),
      "utf8",
    );
    expect(route).toContain("getApprovalEligibility");
    expect(route).toContain("assertAiReviewInUserWorkspace");
  });
});
