import { describe, expect, it } from "vitest";

import { AgentTrace } from "./agent-trace";

describe("agent trace", () => {
  it("records tool spans with duration", () => {
    const trace = new AgentTrace("00000000-0000-4000-8000-000000000001");
    trace.recordTool("get_workspace", Date.now() - 25, true);
    const spans = trace.toSpans();
    expect(spans[0]?.name).toBe("tool:get_workspace");
    expect(spans[0]?.ok).toBe(true);
    expect(spans[0]?.durationMs).toBeGreaterThan(0);
    expect(trace.toLogPayload().traceId).toBe("00000000-0000-4000-8000-000000000001");
  });
});
