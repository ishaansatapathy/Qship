import type { AgentToolMemoryEntry } from "./agent-tool-memory";

export type AgentFocus = {
  threadId?: string;
  eventId?: string;
};

export async function buildFocusSystemAppendix(
  tenantId: string,
  focus: AgentFocus | undefined,
  userEmail?: string,
): Promise<string> {
  if (!focus?.threadId?.trim() && !focus?.eventId?.trim()) return "";

  const lines = [
    "",
    "═══ CURRENT USER FOCUS (highest priority — overrides older chat topics) ═══",
  ];

  if (focus.threadId?.trim()) {
    const threadId = focus.threadId.trim();

    if (threadId.startsWith("feature:")) {
      const featureId = threadId.slice("feature:".length);
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

    // Legacy email thread focus — only when inbox service is available
    try {
      const { summarizeThread } = await import("./summarize-thread");
      const summary = await summarizeThread({ tenantId, threadId, userEmail });
      lines.push(
        "Type: EMAIL THREAD (legacy)",
        `threadId: ${threadId}`,
        `subject: ${summary.subject}`,
        `summary: ${summary.summary}`,
      );
    } catch {
      lines.push("Type: EMAIL THREAD (legacy)", `threadId: ${threadId}`);
    }
  }

  if (focus.eventId?.trim()) {
    const eventId = focus.eventId.trim();
    lines.push("", "Type: CALENDAR EVENT (legacy)", `eventId: ${eventId}`);
  }

  return lines.filter(Boolean).join("\n");
}
