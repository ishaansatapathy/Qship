import { describe, expect, it } from "vitest";

import { fallbackApprovalDefaults, isShipflowDemoMode } from "../settings/demo-mode";

describe("shipflow demo mode policy", () => {
  it("defaults auto-approve off outside demo mode", () => {
    const prevDemo = process.env.SHIPFLOW_DEMO_MODE;
    const prevLogin = process.env.DEMO_LOGIN_ENABLED;
    delete process.env.SHIPFLOW_DEMO_MODE;
    delete process.env.DEMO_LOGIN_ENABLED;
    delete process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED;

    expect(isShipflowDemoMode()).toBe(false);
    expect(fallbackApprovalDefaults().autoApproveAgentEmail).toBe(false);

    process.env.SHIPFLOW_DEMO_MODE = prevDemo;
    process.env.DEMO_LOGIN_ENABLED = prevLogin;
  });

  it("enables demo auto-approve when SHIPFLOW_DEMO_MODE is set", () => {
    const prev = process.env.SHIPFLOW_DEMO_MODE;
    process.env.SHIPFLOW_DEMO_MODE = "true";
    expect(isShipflowDemoMode()).toBe(true);
    expect(fallbackApprovalDefaults().autoApproveAgentEmail).toBe(true);
    process.env.SHIPFLOW_DEMO_MODE = prev;
  });
});
