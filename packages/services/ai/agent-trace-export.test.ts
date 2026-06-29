import { describe, expect, it } from "vitest";

import { buildAgentTraceExport } from "./agent-trace-export";
import { AgentTrace } from "./agent-trace";

describe("agent trace export", () => {
  it("builds OTel-compatible export payload", () => {
    const trace = new AgentTrace("00000000-0000-4000-8000-000000000099");
    trace.recordTool("get_pipeline_summary", Date.now() - 40, true);

    const payload = buildAgentTraceExport(trace, { tenantId: "user-1" });
    expect(payload.traceId).toBe("00000000-0000-4000-8000-000000000099");
    expect(payload.serviceName).toBe("shipflow-agent");
    expect(payload.spans[0]?.name).toBe("tool:get_pipeline_summary");
    expect(payload.tenantId).toBe("user-1");
  });
});
