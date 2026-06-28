"use client";

import { CheckCircle2, Circle, GitBranch, ListTodo, Loader2, Sparkles } from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";

type WalkthroughState = RouterOutputs["feature"]["getTaskWalkthroughState"];
type ExplainResult = RouterOutputs["feature"]["explainTask"];

type Props = {
  state: WalkthroughState | undefined;
  explain: ExplainResult | undefined;
  loading?: boolean;
  explaining?: boolean;
  depth?: "brief" | "full";
  onSelectTask?: (taskId: string) => void;
};

export function TaskWalkthroughPanel({
  state,
  explain,
  loading,
  explaining,
  depth = "brief",
  onSelectTask,
}: Props) {
  if (loading || !state) {
    return (
      <section className="qship-walkthrough-panel" aria-busy="true">
        <div className="qship-walkthrough-head">
          <ListTodo size={14} />
          Task walkthrough
        </div>
        <div className="qship-walkthrough-loading">
          <Loader2 size={16} className="qship-spin" />
          Loading engineering tasks…
        </div>
      </section>
    );
  }

  if (state.totalCount === 0) {
    return null;
  }

  const progress = state.totalCount ? Math.round((state.completedCount / state.totalCount) * 100) : 0;
  const walkthrough = explain?.walkthrough;
  const mode = walkthrough?.mode ?? (state.githubConnected ? "repo_aware" : "plan_only");
  const modeLabel = mode === "repo_aware" ? "Codebase-aware" : "Plan-only";

  return (
    <section className="qship-walkthrough-panel">
      <div className="qship-walkthrough-head">
        <ListTodo size={14} />
        <div>
          <strong>Task walkthrough</strong>
          <p>{state.featureTitle}</p>
        </div>
        <span className="qship-walkthrough-badge" data-mode={mode}>
          {modeLabel}
        </span>
      </div>

      <div className="qship-walkthrough-progress">
        <div className="qship-walkthrough-progress-meta">
          <span>
            {state.completedCount}/{state.totalCount} done
          </span>
          <span>{progress}%</span>
        </div>
        <div className="qship-walkthrough-progress-bar" aria-hidden>
          <div className="qship-walkthrough-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {state.githubConnected && state.repository ? (
        <p className="qship-walkthrough-repo">
          <GitBranch size={12} />
          {state.repository}
        </p>
      ) : null}

      <ol className="qship-walkthrough-task-list">
        {state.tasks.map((task, index) => {
          const isCurrent = task.id === state.currentTaskId;
          const isDone = task.status === "done";
          return (
            <li
              key={task.id}
              className="qship-walkthrough-task-item"
              data-current={isCurrent ? "true" : undefined}
              data-done={isDone ? "true" : undefined}
            >
              <span className="qship-walkthrough-task-icon" aria-hidden>
                {isDone ? <CheckCircle2 size={14} /> : isCurrent ? <Sparkles size={14} /> : <Circle size={12} />}
              </span>
              <button
                type="button"
                className="qship-walkthrough-task-btn"
                onClick={() => onSelectTask?.(task.id)}
                disabled={!onSelectTask}
              >
                <span className="qship-walkthrough-task-index">Task {index + 1}</span>
                <span className="qship-walkthrough-task-title">{task.title}</span>
                {task.taskType ? (
                  <span className="qship-walkthrough-task-type">{task.taskType}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      {explaining ? (
        <div className="qship-walkthrough-loading qship-walkthrough-loading--inline">
          <Loader2 size={14} className="qship-spin" />
          Generating {depth === "full" ? "full guide" : "pseudo-code"}…
        </div>
      ) : null}

      {walkthrough ? (
        <div className="qship-walkthrough-content">
          <p className="qship-walkthrough-summary">{walkthrough.briefSummary}</p>

          {walkthrough.pseudoCodeSteps.length ? (
            <div className="qship-walkthrough-block">
              <h4>Pseudo-code</h4>
              <ol className="qship-walkthrough-steps">
                {walkthrough.pseudoCodeSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {depth === "full" && walkthrough.fullExplanation ? (
            <div className="qship-walkthrough-block">
              <h4>Implementation guide</h4>
              <p className="qship-walkthrough-prose">{walkthrough.fullExplanation}</p>
            </div>
          ) : null}

          {walkthrough.repoFindings?.alreadyImplemented?.length ? (
            <div className="qship-walkthrough-block" data-tone="success">
              <h4>Already in codebase</h4>
              <ul>
                {walkthrough.repoFindings.alreadyImplemented.map((item) => (
                  <li key={`${item.file}-${item.note}`}>
                    <code>{item.file}</code> — {item.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {walkthrough.repoFindings?.stillNeeded?.length ? (
            <div className="qship-walkthrough-block" data-tone="warn">
              <h4>Still needed</h4>
              <ul>
                {walkthrough.repoFindings.stillNeeded.map((item) => (
                  <li key={`${item.action}-${item.reason}`}>
                    <strong>{item.action}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {walkthrough.acceptanceChecklist?.length ? (
            <div className="qship-walkthrough-block">
              <h4>Acceptance checks</h4>
              <ul className="qship-walkthrough-checklist">
                {walkthrough.acceptanceChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
