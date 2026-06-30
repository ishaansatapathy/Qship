
export type AgentFocus = {
  contextId?: string;
  eventId?: string;
  /** Active engineering task for interactive walkthrough mode. */
  walkthroughTaskId?: string;
  /** When true, explain_engineering_task should scan the linked GitHub repo. */
  analyzeRepo?: boolean;
};

export async function buildFocusSystemAppendix(
  tenantId: string,
  focus: AgentFocus | undefined,
  _userEmail?: string, // reserved for future personalized context
): Promise<string> {
  if (
    !focus?.contextId?.trim() &&
    !focus?.eventId?.trim() &&
    !focus?.walkthroughTaskId?.trim()
  ) {
    return "";
  }

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
          "Type: FEATURE REQUEST (Qship)",
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
          "Type: FEATURE REQUEST (Qship)",
          `featureId: ${featureId}`,
          `Use get_feature_request with id "${featureId}".`,
        );
      }
    } else {
      lines.push("Type: WORKSPACE CONTEXT", `contextId: ${contextId}`);
    }
  }

  if (focus.walkthroughTaskId?.trim()) {
    const taskId = focus.walkthroughTaskId.trim();
    const analyzeRepo = focus.analyzeRepo === true;
    lines.push(
      "",
      "Type: INTERACTIVE TASK WALKTHROUGH",
      `currentTaskId: ${taskId}`,
      `analyzeRepo: ${analyzeRepo}`,
      "",
      "WALKTHROUGH RULES (override confirmation gates for this mode only):",
      `- On the FIRST assistant turn, IMMEDIATELY call explain_engineering_task with taskId="${taskId}", depth=brief, analyzeRepo=${analyzeRepo}.`,
      "- Present pseudoCodeSteps as a numbered list. Do not dump all tasks.",
      '- If user says "explain more", call explain_engineering_task with depth=full for the SAME taskId.',
      '- If user says "next task" / "mark done", call update_engineering_task_status (done), then get_feature_request to find the next task and explain_engineering_task for it.',
      "- Use suggestedUserReplies from the tool JSON at the end of each walkthrough response.",
    );
  }

  if (focus.eventId?.trim()) {
    const eventId = focus.eventId.trim();
    lines.push("", "Type: CALENDAR EVENT", `eventId: ${eventId}`);
  }

  return lines.filter(Boolean).join("\n");
}
