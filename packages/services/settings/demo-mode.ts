import type { ApprovalDefaults } from "./index";

/** Demo deployments opt in via env; production defaults stay strict. */
export function isShipflowDemoMode(): boolean {
  return (
    process.env.SHIPFLOW_DEMO_MODE === "true" ||
    process.env.DEMO_LOGIN_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true"
  );
}

export function fallbackApprovalDefaults(): ApprovalDefaults {
  return {
    autoApproveEmail: false,
    autoApproveAgentEmail: isShipflowDemoMode(),
    autoApproveCalendar: false,
  };
}
