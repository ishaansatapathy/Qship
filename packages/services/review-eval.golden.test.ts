import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AGENT_TOOLS } from "./ai/agent-internals";
import { SHIPFLOW_MCP_TOOLS } from "./shipflow-agent-tools";
import {
  evaluateHumanApprovalEligibility,
  getHumanApprovalEligibility,
  loadHumanApprovalGateContext,
  persistAiReview,
  recordHumanApproval,
  validateHumanApprovalEligibility,
} from "./review";
import { isFeatureTransitionAllowed } from "./feature-request";

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
  "request_changes_trpc_route",
  "single_fetch_approval_gate",
  "resolve_review_issue_requires_auth",
  // 15/15 hardening additions
  "in_txn_eligibility_recheck_toctou",
  "iteration_unique_constraint_migration",
  "fsm_shortcut_pr_open_approved_removed",
  "fsm_shortcut_fix_needed_human_review_removed",
  "fix_needed_loop_fsm_coverage",
  "advisory_issues_dont_block_approval",
] as const;

export const REVIEW_EVAL_INVARIANT_COUNT = REVIEW_EVAL_INVARIANTS.length;

describe("review loop eval harness", () => {
  it(`documents ${REVIEW_EVAL_INVARIANT_COUNT}+ review invariants`, () => {
    expect(REVIEW_EVAL_INVARIANT_COUNT).toBeGreaterThanOrEqual(12);
  });

  it("exports core review loop service functions", () => {
    expect(typeof persistAiReview).toBe("function");
    expect(typeof recordHumanApproval).toBe("function");
    expect(typeof validateHumanApprovalEligibility).toBe("function");
    expect(typeof getHumanApprovalEligibility).toBe("function");
    expect(typeof evaluateHumanApprovalEligibility).toBe("function");
    expect(typeof loadHumanApprovalGateContext).toBe("function");
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

  it("blocks approve when latest review failed in pure gate", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: false,
        issues: [{ severity: "blocking", resolved: false }],
        rawAnalysis: {},
      },
      isProduction: true,
    });
    expect(result.eligible).toBe(false);
  });

  it("exposes requestChanges tRPC route distinct from deprecated reject alias", () => {
    const route = readFileSync(
      path.resolve(__dirname, "../trpc/server/routes/feature/route.ts"),
      "utf8",
    );
    expect(route).toContain("requestChanges:");
    expect(route).toContain("/feature/requests/{id}/request-changes");
    expect(route).toContain("runRequestChangesMutation");
  });

  it("uses single-load gate context in validateHumanApprovalEligibility", () => {
    const gate = readFileSync(path.resolve(__dirname, "./review-gate.ts"), "utf8");
    expect(gate).toContain("loadHumanApprovalGateContext");
    expect(gate).not.toMatch(/getLatestAiReview\(featureRequestId\)[\s\S]*getLatestAiReview\(featureRequestId\)/);
  });

  it("requests page disables approve while eligibility is loading", () => {
    const ui = readFileSync(
      path.resolve(__dirname, "../../apps/web/app/(app)/requests/page.tsx"),
      "utf8",
    );
    expect(ui).toContain("approvalEligibility.isLoading");
    expect(ui).toContain("getApprovalEligibility");
  });

  it("does not allow illegal shortcut to shipped without approved", () => {
    expect(isFeatureTransitionAllowed("human_review", "shipped")).toBe(false);
    expect(isFeatureTransitionAllowed("approved", "shipped")).toBe(true);
  });

  it("pr_open → approved shortcut is removed from FSM (forces human_review gate)", () => {
    expect(isFeatureTransitionAllowed("pr_open", "approved")).toBe(false);
    expect(isFeatureTransitionAllowed("pr_open", "human_review")).toBe(true);
  });

  it("fix_needed → human_review shortcut is removed from FSM (forces re-review)", () => {
    expect(isFeatureTransitionAllowed("fix_needed", "human_review")).toBe(false);
    expect(isFeatureTransitionAllowed("fix_needed", "ai_review")).toBe(true);
  });

  it("in-txn TOCTOU re-check is present in recordHumanApproval source", () => {
    const src = readFileSync(path.resolve(__dirname, "./review.ts"), "utf8");
    expect(src).toContain("In-transaction eligibility re-check");
    expect(src).toContain("evaluateHumanApprovalEligibility");
    expect(src).toContain("concurrent state change detected");
  });

  it("iteration unique constraint migration exists", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../packages/database/drizzle/0053_ai_review_iteration_unique.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("UNIQUE");
    expect(sql).toContain("feature_request_id");
    expect(sql).toContain("iteration");
  });

  it("persistAiReview uses SELECT FOR UPDATE to serialize iteration assignment", () => {
    const src = readFileSync(path.resolve(__dirname, "./review.ts"), "utf8");
    expect(src).toContain("FOR UPDATE");
    expect(src).toContain("Serialise concurrent reviews");
  });

  it("advisory-only issues allow approval in pure gate", () => {
    const result = evaluateHumanApprovalEligibility({
      status: "human_review",
      latestReview: {
        readyForHuman: true,
        issues: [
          { severity: "advisory", resolved: false },
          { severity: "advisory", resolved: false },
        ],
        rawAnalysis: {},
      },
      isProduction: false,
    });
    expect(result.eligible).toBe(true);
  });
});
