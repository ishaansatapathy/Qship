import { describe, expect, it } from "vitest";

import { AGENT_CONFIRMATION_TOOLS, checkAgentToolConfirmation } from "./agent-tool-confirm";

const DEFAULTS = {
  autoApproveEmail: false,
  autoApproveAgentEmail: false,
  autoApproveCalendar: false,
};

describe("checkAgentToolConfirmation", () => {
  it("allows read-only tools without confirmation", () => {
    const result = checkAgentToolConfirmation({
      toolName: "get_feature_request",
      userMessage: "show me this feature",
      approvalDefaults: DEFAULTS,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks destructive tools when user did not confirm", () => {
    const result = checkAgentToolConfirmation({
      toolName: "generate_feature_prd",
      userMessage: "what is the status of this feature?",
      approvalDefaults: DEFAULTS,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("confirmation required");
    }
  });

  it("allows destructive tools when user explicitly requests the action", () => {
    const result = checkAgentToolConfirmation({
      toolName: "generate_feature_prd",
      userMessage: "Please generate a PRD for this feature request",
      approvalDefaults: DEFAULTS,
    });
    expect(result).toMatchObject({ allowed: true, reason: "explicit_intent" });
  });

  it("allows destructive tools after affirmative follow-up", () => {
    const result = checkAgentToolConfirmation({
      toolName: "run_ai_review",
      userMessage: "yes go ahead",
      approvalDefaults: DEFAULTS,
    });
    expect(result).toMatchObject({ allowed: true, reason: "affirmative" });
  });

  it("allows all confirmation tools when auto-approve is enabled", () => {
    for (const toolName of AGENT_CONFIRMATION_TOOLS) {
      const result = checkAgentToolConfirmation({
        toolName,
        userMessage: "hello",
        approvalDefaults: { ...DEFAULTS, autoApproveAgentEmail: true },
      });
      expect(result).toMatchObject({ allowed: true, reason: "auto_approve" });
    }
  });

  it("allows ship_feature when user says ship this feature", () => {
    const result = checkAgentToolConfirmation({
      toolName: "ship_feature",
      userMessage: "ship this feature to production",
      approvalDefaults: DEFAULTS,
    });
    expect(result.allowed).toBe(true);
  });
});
