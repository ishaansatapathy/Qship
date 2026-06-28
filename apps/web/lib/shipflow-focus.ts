/** Client-safe helpers for ShipFlow feature focus in agent sessions. */
export const FEATURE_FOCUS_PREFIX = "feature:";

export function isFeatureFocusId(value: string | undefined): boolean {
  return Boolean(value?.startsWith(FEATURE_FOCUS_PREFIX));
}

export function toFeatureFocusId(featureId: string): string {
  return `${FEATURE_FOCUS_PREFIX}${featureId}`;
}

export function fromFeatureFocusId(value: string): string {
  return value.startsWith(FEATURE_FOCUS_PREFIX) ? value.slice(FEATURE_FOCUS_PREFIX.length) : value;
}

/** Deep-link into agent task walkthrough (plan-only or repo-aware). */
export function buildTaskWalkthroughAgentUrl(input: {
  featureId: string;
  taskId?: string;
  taskIndex?: number;
  analyzeRepo?: boolean;
}) {
  const focus = toFeatureFocusId(input.featureId);
  const taskHint =
    input.taskId ?
      ` Start with task ${input.taskIndex ?? 1}. First task id: ${input.taskId}.`
    : "";
  const repoHint =
    input.analyzeRepo ?
      " GitHub is connected — use analyzeRepo=true for codebase-aware guidance."
    : " No repo analysis yet — plan-only pseudo-code.";
  const prompt = `Interactive task walkthrough.${taskHint}${repoHint} Use explain_engineering_task with depth=brief for the current task only. Show pseudo-code steps. Wait for me to say "explain more" or "next task".`;
  const params = new URLSearchParams({
    focus,
    walkthrough: "1",
    prompt,
  });
  if (input.taskId) params.set("task", input.taskId);
  if (input.analyzeRepo) params.set("repo", "1");
  return `/agent?${params.toString()}`;
}
