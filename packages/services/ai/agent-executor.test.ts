import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerSettingsService } from "../settings";
import { buildToolExecutor } from "./agent-executor";

vi.mock("../shipflow-agent-tools", () => ({
  isShipflowTool: (name: string) => name === "generate_feature_prd" || name === "get_workspace",
  executeShipflowTool: vi.fn(async () => JSON.stringify({ ok: true })),
}));

describe("agent tool executor confirmation gate", () => {
  beforeEach(() => {
    registerSettingsService({
      getApprovalDefaults: async () => ({
        autoApproveEmail: false,
        autoApproveAgentEmail: false,
        autoApproveCalendar: false,
      }),
      updateApprovalDefaults: async (_userId, input) => input,
    });
  });

  it("blocks generate_feature_prd without user confirmation", async () => {
    const execute = buildToolExecutor({
      tenantId: "user-1",
      actions: [],
      userMessage: "what is the pipeline status?",
      approvalDefaults: {
        autoApproveEmail: false,
        autoApproveAgentEmail: false,
        autoApproveCalendar: false,
      },
    });

    const raw = await execute("generate_feature_prd", { id: "feat-1" });
    const parsed = JSON.parse(raw) as { confirmationRequired?: boolean; error?: string };
    expect(parsed.confirmationRequired).toBe(true);
    expect(parsed.error).toContain("did not ask");
  });

  it("allows generate_feature_prd when user explicitly asks", async () => {
    const { executeShipflowTool } = await import("../shipflow-agent-tools");
    const execute = buildToolExecutor({
      tenantId: "user-1",
      actions: [],
      userMessage: "generate a PRD for this feature",
      approvalDefaults: {
        autoApproveEmail: false,
        autoApproveAgentEmail: false,
        autoApproveCalendar: false,
      },
    });

    const raw = await execute("generate_feature_prd", { id: "feat-1" });
    expect(JSON.parse(raw)).toEqual({ ok: true });
    expect(executeShipflowTool).toHaveBeenCalled();
  });

  it("allows read tools without confirmation", async () => {
    const { executeShipflowTool } = await import("../shipflow-agent-tools");
    const execute = buildToolExecutor({
      tenantId: "user-1",
      actions: [],
      userMessage: "hello",
      approvalDefaults: {
        autoApproveEmail: false,
        autoApproveAgentEmail: false,
        autoApproveCalendar: false,
      },
    });

    await execute("get_workspace", {});
    expect(executeShipflowTool).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      "get_workspace",
      {},
    );
  });
});
