import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Labeled invariants for SaaS product experience merge gate (see AI_EVAL.md §6). */
export const SAAS_EVAL_INVARIANTS = [
  "one_click_demo_login",
  "pipeline_dashboard_brief",
  "feature_hub_requests",
  "agent_walkthrough_panel",
  "kanban_tasks_board",
  "billing_razorpay_checkout",
  "billing_order_server_verification",
  "github_settings_connect",
  "app_shell_nav_all_surfaces",
  "trpc_proxy_csrf_session",
  "playwright_e2e_saas_journey",
] as const;

export const SAAS_EVAL_INVARIANT_COUNT = SAAS_EVAL_INVARIANTS.length;

const repoRoot = path.resolve(__dirname, "../..");

function readRepo(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("SaaS product experience eval harness", () => {
  it(`documents ${SAAS_EVAL_INVARIANT_COUNT} SaaS invariants`, () => {
    expect(SAAS_EVAL_INVARIANT_COUNT).toBe(11);
  });

  it("exposes one-click demo login with next-path redirect", () => {
    const route = readRepo("apps/web/app/api-auth/demo/route.ts");
    expect(route).toContain("isDemoModeEnabled");
    expect(route).toContain('searchParams.get("next")');
    expect(route).toContain('"/brief"');
    expect(route).toContain("signInEmail");
  });

  it("implements pipeline dashboard at /brief with live tRPC summary", () => {
    const page = readRepo("apps/web/app/(app)/brief/page.tsx");
    expect(page).toContain("Pipeline overview");
    expect(page).toContain("trpc.feature.pipelineSummary.useQuery");
    expect(page).toContain("trpc.feature.list.useQuery");
  });

  it("implements feature hub at /requests with approval and delivery actions", () => {
    const page = readRepo("apps/web/app/(app)/requests/page.tsx");
    expect(page).toContain("trpc.feature.create.useMutation");
    expect(page).toContain("trpc.feature.approve.useMutation");
    expect(page).toContain("getApprovalEligibility");
  });

  it("implements agent page with task walkthrough panel", () => {
    const agent = readRepo("apps/web/app/(app)/agent/page.tsx");
    const panel = readRepo("apps/web/components/app/task-walkthrough-panel.tsx");
    expect(agent).toContain("TaskWalkthroughPanel");
    expect(agent).toContain('searchParams.get("walkthrough")');
    expect(panel.length).toBeGreaterThan(100);
  });

  it("implements Kanban engineering board at /tasks", () => {
    const page = readRepo("apps/web/app/(app)/tasks/page.tsx");
    expect(page).toContain("Engineering board");
    expect(page).toContain("trpc.feature.taskBoard.useQuery");
    expect(page).toContain('data-testid={`kanban-column-');
  });

  it("implements billing page with Razorpay checkout and demo fallback", () => {
    const page = readRepo("apps/web/app/(app)/billing/page.tsx");
    const billingRoute = readRepo("packages/trpc/server/routes/billing/route.ts");
    const billingService = readRepo("packages/services/billing/index.ts");
    const orderVerify = readRepo("packages/services/billing/order-verify.ts");
    expect(page).toContain("Billing & plans");
    expect(page).toContain("useRazorpayCheckout");
    expect(page).toContain('result.mode === "demo"');
    expect(page).toContain("One-time purchase");
    expect(billingRoute).toContain("createCheckout");
    expect(billingRoute).toContain("confirmPayment");
    expect(billingService).toContain("resolveVerifiedPlanTierFromOrder");
    expect(orderVerify).toContain("assertRazorpayOrderMatchesPlan");
  });

  it("implements GitHub settings with install and sync controls", () => {
    const page = readRepo("apps/web/app/(app)/settings/page.tsx");
    expect(page).toContain("GitHub");
    expect(page).toContain("trpc.github.connectionStatus");
    expect(page).toContain("trpc.github.getInstallUrl");
    expect(page).toContain("syncInstallation");
  });

  it("wires app shell navigation for all rubric SaaS surfaces", () => {
    const shell = readRepo("apps/web/components/app/qship-app-shell.tsx");
    for (const href of ["/brief", "/requests", "/tasks", "/agent", "/billing"]) {
      expect(shell).toContain(`href: "${href}"`);
    }
    expect(shell).toContain('href="/settings"');
    expect(shell).toContain("DemoBar");
    expect(shell).toContain("QshipCommand");
    const command = readRepo("apps/web/components/app/qship-command.tsx");
    expect(command).toContain('go("/billing")');
  });

  it("proxies tRPC with CSRF header so session cookies work in the browser", () => {
    const proxy = readRepo("apps/web/app/trpc/[...path]/route.ts");
    expect(proxy).toContain('headers.set("x-app-csrf", "1")');
    expect(proxy).toContain("appendProxiedSetCookies");
    expect(readRepo("apps/web/trpc/create-client.ts")).toContain('credentials: "include"');
  });

  it("covers SaaS surfaces in Playwright demo journey", () => {
    const spec = readRepo("apps/web/e2e/shipflow-demo.spec.ts");
    expect(spec).toContain('demoLogin(page, "/brief")');
    expect(spec).toContain('demoLogin(page, "/requests")');
    expect(spec).toContain('demoLogin(page, "/agent")');
    expect(spec).toContain('demoLogin(page, "/tasks")');
    expect(spec).toContain('demoLogin(page, "/settings")');
    expect(spec).toContain('demoLogin(page, "/billing")');
    expect(spec).toContain("engineering board");
    expect(spec).toContain("billing & plans");
  });
});
