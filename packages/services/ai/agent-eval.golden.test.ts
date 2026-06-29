import { describe, expect, it } from "vitest";

import {
  AGENT_CONFIRMATION_EVAL_CASES,
  AGENT_EVAL_CASE_COUNT,
  AGENT_INJECTION_EVAL_CASES,
} from "./agent-eval-cases";
import { detectInjectionAttempt } from "./agent-guard";
import { checkAgentToolConfirmation } from "./agent-tool-confirm";

const DEFAULTS = {
  autoApproveEmail: false,
  autoApproveAgentEmail: false,
  autoApproveCalendar: false,
};

describe("agent golden eval harness", () => {
  it(`runs ${AGENT_EVAL_CASE_COUNT}+ labeled control-plane cases`, () => {
    expect(AGENT_EVAL_CASE_COUNT).toBeGreaterThanOrEqual(45);
  });

  it.each(AGENT_INJECTION_EVAL_CASES)("$id injection expectation", ({ message, expectFlagged }) => {
    const result = detectInjectionAttempt(message);
    expect(result.flagged).toBe(expectFlagged);
  });

  it.each(AGENT_CONFIRMATION_EVAL_CASES)(
    "$id confirmation expectation",
    ({ tool, message, expectAllowed }) => {
      const result = checkAgentToolConfirmation({
        toolName: tool,
        toolArgs: { id: "feat-eval-1" },
        userMessage: message,
        approvalDefaults: DEFAULTS,
      });
      expect(result.allowed).toBe(expectAllowed);
    },
  );
});
