"use client";

import { useEffect, useRef } from "react";
import { Loader2, Square } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";

export function WorkflowProgress({ featureId }: { featureId: string }) {
  const utils = trpc.useUtils();
  const hadActive = useRef(false);

  const workflows = trpc.feature.listWorkflows.useQuery(
    { featureId },
    {
      refetchInterval: (query) => {
        const rows = query.state.data ?? [];
        const active = rows.some((r) => r.status === "pending" || r.status === "running");
        return active ? 2000 : false;
      },
    },
  );

  const cancelWorkflow = trpc.feature.cancelWorkflow.useMutation({
    onSuccess: async (result) => {
      await utils.feature.listWorkflows.invalidate({ featureId });
      await utils.feature.get.invalidate({ id: featureId });
      toast.success(
        result.cancelled === 1 ? "Workflow stopped" : `Stopped ${result.cancelled} workflow(s)`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = workflows.data ?? [];
  const activeRows = rows.filter((r) => r.status === "pending" || r.status === "running");
  const active = activeRows.length > 0;
  const latest = activeRows[0] ?? rows[0];

  useEffect(() => {
    if (hadActive.current && !active) {
      void utils.feature.get.invalidate({ id: featureId });
      void utils.feature.list.invalidate();
      void utils.feature.delivery.invalidate({ id: featureId });
    }
    hadActive.current = active;
  }, [active, featureId, utils.feature.delivery, utils.feature.get, utils.feature.list]);

  if (rows.length === 0) return null;

  return (
    <section className="qship-req-triage qship-workflow-panel" style={{ marginTop: 12 }}>
      <div className="qship-workflow-head">
        <strong style={{ fontSize: 13 }}>Background workflow</strong>
        {active ? (
          <button
            type="button"
            className="qship-workflow-stop"
            disabled={cancelWorkflow.isPending}
            onClick={() =>
              cancelWorkflow.mutate({
                featureId,
                workflowRunId: activeRows.length === 1 ? activeRows[0]!.id : undefined,
              })
            }
            title="Stop this workflow"
          >
            {cancelWorkflow.isPending ? (
              <Loader2 size={12} className="qship-spin" />
            ) : (
              <Square size={12} fill="currentColor" />
            )}
            Stop
          </button>
        ) : null}
      </div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, opacity: 0.9 }}>
        {rows.slice(0, 3).map((run) => {
          const isActive = run.status === "pending" || run.status === "running";
          const isCancelled = run.error === "Cancelled by user";
          const isFailed = run.status === "failed" && !isCancelled;
          return (
            <li key={run.id} style={{ marginBottom: 6 }}>
              <span style={{ textTransform: "capitalize" }}>{run.type.replace(/_/g, " ")}</span>
              {" · "}
              <span style={isFailed ? { color: "#f87171" } : undefined}>
                {isCancelled ? "cancelled" : run.status}
              </span>
              {run.message && !isCancelled ? ` — ${run.message}` : ""}
              {isFailed && run.error ? (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 2, opacity: 0.9 }}>
                  {run.error}
                </div>
              ) : null}
              {isActive ? (
                <Loader2 size={12} className="qship-spin" style={{ marginLeft: 6, verticalAlign: -2 }} />
              ) : null}
              {run.progress > 0 && run.progress < 100 && isActive ? ` (${run.progress}%)` : null}
              {isActive && activeRows.length > 1 ? (
                <button
                  type="button"
                  className="qship-workflow-stop-inline"
                  disabled={cancelWorkflow.isPending}
                  onClick={() => cancelWorkflow.mutate({ featureId, workflowRunId: run.id })}
                >
                  stop
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {active && latest ? (
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          {latest.message ?? "Workflow running…"} — updates every few seconds. Use{" "}
          <strong>Stop</strong> if it looks stuck.
        </p>
      ) : null}
    </section>
  );
}
