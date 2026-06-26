import type { AgentToolMemoryEntry } from "./agent-tool-memory";

export type AgentFocus = {
  contextId?: string;
  eventId?: string;
};

export async function buildFocusSystemAppendix(
  tenantId: string,
  focus: AgentFocus | undefined,
  _userEmail?: string,
): Promise<string> {
  if (!focus?.contextId?.trim() && !focus?.eventId?.trim()) return "";

  const lines = [
    "",
    "═══ CURRENT USER FOCUS (highest priority — overrides older chat topics) ═══",
  ];

  if (focus.contextId?.trim()) {
    const contextId = focus.contextId.trim();

    if (contextId.startsWith("feature:")) {
      const featureId = contextId.slice("feature:".length);
      try {
        const { assertFeatureInUserWorkspace } = await import("../feature-request");
        const { feature } = await assertFeatureInUserWorkspace(tenantId, featureId);
        lines.push(
          "Type: FEATURE REQUEST (ShipFlow)",
          `featureId: ${feature.id}`,
          `title: ${feature.title}`,
          `status: ${feature.status}`,
          `request: ${feature.rawRequest.slice(0, 500)}`,
          feature.prd ? "PRD: available — use get_feature_request for full content" : "PRD: not generated yet",
          "",
          'When the user says "this feature", "this request", or "generate PRD for this", they mean THIS feature.',
          `Use get_feature_request with id "${feature.id}".`,
        );
      } catch {
        lines.push(
          "Type: FEATURE REQUEST (ShipFlow)",
          `featureId: ${featureId}`,
          `Use get_feature_request with id "${featureId}".`,
        );
      }
      return lines.filter(Boolean).join("\n");
    }

    lines.push("Type: WORKSPACE CONTEXT", `contextId: ${contextId}`);
  }

  if (focus.eventId?.trim()) {
    const eventId = focus.eventId.trim();
    lines.push("", "Type: CALENDAR EVENT", `eventId: ${eventId}`);
  }

  return lines.filter(Boolean).join("\n");
}
