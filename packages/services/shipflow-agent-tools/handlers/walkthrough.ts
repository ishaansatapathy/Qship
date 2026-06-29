import { explainEngineeringTaskForUser, advanceTaskWalkthroughForUser } from "../../task-walkthrough";

import type { ShipflowToolContext } from "../definitions";

export async function handle_explain_engineering_task(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const taskId = String(args.taskId ?? "").trim();
        if (!taskId) return JSON.stringify({ error: "taskId is required" });
        const depth = args.depth === "full" ? "full" : "brief";
        const analyzeRepo = args.analyzeRepo === true;

        const result = await explainEngineeringTaskForUser(userId, {
          taskId,
          depth,
          analyzeRepo,
        });
        const { walkthrough, taskIndex } = result;

        const modeLabel = walkthrough.mode === "repo_aware" ? "codebase-aware" : "plan-only";
        const implemented = walkthrough.repoFindings?.alreadyImplemented ?? [];
        actions.push({
          kind: "feature_tasks",
          title: `Task ${taskIndex}/${walkthrough.totalTasks}: ${walkthrough.taskTitle}`,
          detail: `${modeLabel} · ${depth === "brief" ? "pseudo-code" : "full guide"}`,
          href: `/tasks`,
          lines: [
            walkthrough.briefSummary,
            ...walkthrough.pseudoCodeSteps.slice(0, 3),
            ...implemented.slice(0, 2).map((x) => `✓ ${x.file}: ${x.note}`),
          ],
        });
        return JSON.stringify({
          ...walkthrough,
          taskId: result.taskId,
          featureId: result.featureId,
          repository: result.repository,
          repoSnippetCount: result.repoSnippetCount,
        });
}

export async function handle_advance_task_walkthrough(
  ctx: ShipflowToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const { userId, actions } = ctx;
  const currentTaskId = String(args.currentTaskId ?? "").trim();
        if (!currentTaskId) return JSON.stringify({ error: "currentTaskId is required" });
        const analyzeRepo = args.analyzeRepo === true;

        const result = await advanceTaskWalkthroughForUser(userId, { currentTaskId, analyzeRepo });
        if (result.completed) {
          actions.push({
            kind: "feature_tasks",
            title: "Walkthrough complete",
            detail: result.message,
            href: "/tasks",
          });
          return JSON.stringify(result);
        }

        const { walkthrough, taskIndex } = result;
        const modeLabel = walkthrough.mode === "repo_aware" ? "codebase-aware" : "plan-only";
        actions.push({
          kind: "feature_tasks",
          title: `Task ${taskIndex}/${walkthrough.totalTasks}: ${walkthrough.taskTitle}`,
          detail: `${modeLabel} · next task`,
          href: `/tasks`,
          lines: [walkthrough.briefSummary, ...walkthrough.pseudoCodeSteps.slice(0, 3)],
        });
        return JSON.stringify(result);
}
