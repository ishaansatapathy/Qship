"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { toast } from "sonner";
import { ArrowRight, Kanban, Loader2, ListTodo } from "lucide-react";

import type { RouterOutputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";
import { StatSkeletonGrid } from "~/components/app/skeleton-panels";

type TaskRow = RouterOutputs["feature"]["taskBoard"]["tasks"][number];

const COLUMNS = [
  { id: "backlog", label: "Backlog", accent: "#71717a" },
  { id: "todo", label: "To do", accent: "#94a3b8" },
  { id: "in_progress", label: "In progress", accent: "#38bdf8" },
  { id: "review", label: "Review", accent: "#a78bfa" },
  { id: "done", label: "Done", accent: "#4ade80" },
] as const;

function TaskCard({
  task,
  onStatusChange,
  pending,
}: {
  task: TaskRow;
  onStatusChange: (taskId: string, status: TaskRow["status"]) => void;
  pending: boolean;
}) {
  return (
    <article className="qship-kanban-card" data-testid={`task-card-${task.id}`}>
      <Link href={`/requests?id=${task.featureId}`} className="qship-kanban-card-feature">
        {task.featureTitle}
      </Link>
      <h3 className="qship-kanban-card-title">{task.title}</h3>
      {task.description ? <p className="qship-kanban-card-desc">{task.description}</p> : null}
      <label className="qship-kanban-card-move">
        <span>Move to</span>
        <select
          value={task.status}
          disabled={pending}
          onChange={(e) => onStatusChange(task.id, e.target.value as TaskRow["status"])}
          aria-label={`Move ${task.title} to another column`}
        >
          {COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>
              {col.label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

export default function TasksPage() {
  const utils = trpc.useUtils();
  const board = trpc.feature.taskBoard.useQuery({});

  const updateStatus = trpc.feature.updateTaskStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.feature.taskBoard.cancel();
      const prev = utils.feature.taskBoard.getData({});
      utils.feature.taskBoard.setData({}, (current) => {
        if (!current) return current;
        return {
          tasks: current.tasks.map((task) => (task.id === id ? { ...task, status } : task)),
        };
      });
      return { prev };
    },
    onError: (error, _input, context) => {
      if (context?.prev) utils.feature.taskBoard.setData({}, context.prev);
      toast.error(error.message);
    },
    onSuccess: async () => {
      await utils.feature.taskBoard.invalidate();
      await utils.feature.delivery.invalidate();
    },
  });

  const tasks = board.data?.tasks ?? [];
  const byColumn = useMemo(() => {
    const map = new Map<TaskRow["status"], TaskRow[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const task of tasks) {
      const bucket = map.get(task.status) ?? [];
      bucket.push(task);
      map.set(task.status, bucket);
    }
    return map;
  }, [tasks]);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="qship-app-page" data-testid="tasks-board">
      <div className="qship-brief-page">
        <header className="qship-brief-header">
          <div className="qship-brief-header-main">
            <Kanban size={18} style={{ opacity: 0.75 }} />
            <div>
              <h1>Engineering board</h1>
              <p>Kanban view of AI-generated tasks across all feature requests.</p>
            </div>
          </div>
          <Link href="/requests" className="qship-btn-accent">
            Feature requests
            <ArrowRight size={14} />
          </Link>
        </header>

        {board.isLoading ? (
          <StatSkeletonGrid count={4} />
        ) : (
          <div className="qship-req-stats qship-content-reveal" style={{ marginBottom: 20 }}>
            <div className="qship-req-stat">
              <span className="qship-req-stat-label">Total tasks</span>
              <span className="qship-req-stat-value">{tasks.length}</span>
            </div>
            <div className="qship-req-stat">
              <span className="qship-req-stat-label">In progress</span>
              <span className="qship-req-stat-value" style={{ color: "#38bdf8" }}>
                {byColumn.get("in_progress")?.length ?? 0}
              </span>
            </div>
            <div className="qship-req-stat">
              <span className="qship-req-stat-label">In review</span>
              <span className="qship-req-stat-value" style={{ color: "#a78bfa" }}>
                {byColumn.get("review")?.length ?? 0}
              </span>
            </div>
            <div className="qship-req-stat">
              <span className="qship-req-stat-label">Done</span>
              <span className="qship-req-stat-value" style={{ color: "#4ade80" }}>
                {doneCount}
              </span>
            </div>
          </div>
        )}

        {board.isLoading ? (
          <div className="qship-kanban-loading">
            <Loader2 size={20} className="qship-spin" />
            <span>Loading task board…</span>
          </div>
        ) : tasks.length === 0 ? (
          <section className="qship-brief-section qship-content-reveal">
            <div className="qship-brief-section-body qship-kanban-empty">
              <ListTodo size={28} style={{ opacity: 0.45 }} />
              <h2>No engineering tasks yet</h2>
              <p>Generate tasks from a PRD on Feature Requests — they will appear here automatically.</p>
              <Link href="/requests" className="qship-btn-accent">
                Open requests
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        ) : (
          <div className="qship-kanban-board qship-content-reveal">
            {COLUMNS.map((col) => {
              const columnTasks = byColumn.get(col.id) ?? [];
              return (
                <section
                  key={col.id}
                  className="qship-kanban-column"
                  data-testid={`kanban-column-${col.id}`}
                  style={{ "--kanban-accent": col.accent } as CSSProperties}
                >
                  <header className="qship-kanban-column-head">
                    <span className="qship-kanban-column-dot" />
                    <h2>{col.label}</h2>
                    <span className="qship-kanban-column-count">{columnTasks.length}</span>
                  </header>
                  <div className="qship-kanban-column-body">
                    {columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        pending={updateStatus.isPending}
                        onStatusChange={(taskId, status) => {
                          if (status === task.status) return;
                          updateStatus.mutate({ id: taskId, status });
                        }}
                      />
                    ))}
                    {columnTasks.length === 0 ? (
                      <p className="qship-kanban-column-empty">No tasks</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
