"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

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

  const rows = workflows.data ?? [];
  const active = rows.some((r) => r.status === "pending" || r.status === "running");
  const latest = rows.find((r) => r.status === "pending" || r.status === "running") ?? rows[0];

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
    <section className="qship-req-triage" style={{ marginTop: 12 }}>
      <strong style={{ fontSize: 13 }}>Inngest workflow</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, opacity: 0.9 }}>
        {rows.slice(0, 3).map((run) => (
          <li key={run.id} style={{ marginBottom: 6 }}>
            <span style={{ textTransform: "capitalize" }}>{run.type.replace(/_/g, " ")}</span>
            {" · "}
            <span>{run.status}</span>
            {run.message ? ` — ${run.message}` : ""}
            {run.status === "running" || run.status === "pending" ? (
              <Loader2 size={12} className="qship-spin" style={{ marginLeft: 6, verticalAlign: -2 }} />
            ) : null}
            {run.progress > 0 && run.progress < 100 ? ` (${run.progress}%)` : null}
          </li>
        ))}
      </ul>
      {active && latest ? (
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          {latest.message ?? "Workflow running…"} — progress updates every few seconds.
        </p>
      ) : null}
    </section>
  );
}
