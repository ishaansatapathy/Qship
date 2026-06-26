"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Rocket, Search } from "lucide-react";

import { trpc } from "~/trpc/client";
import type { AgentFocusState } from "./agent-focus-chip";
import { toFeatureFocusId } from "~/lib/shipflow-focus";

type AgentContextPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (focus: AgentFocusState) => void;
  disabled?: boolean;
};

export function AgentContextPicker({ open, onClose, onSelect, disabled }: AgentContextPickerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const featuresQuery = trpc.feature.list.useQuery({}, { enabled: open, staleTime: 30_000 });

  const filtered = useMemo(() => {
    const rows = featuresQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows.slice(0, 12);
    return rows
      .filter(
        (row) =>
          row.title.toLowerCase().includes(q) ||
          row.rawRequest.toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [featuresQuery.data, query]);

  if (!open) return null;

  return (
    <div className="qship-agent-context-picker" role="dialog" aria-label="Attach feature context">
      <div className="qship-agent-context-picker-head">
        <Paperclip size={14} />
        <span>Attach feature</span>
        <button type="button" className="qship-agent-context-picker-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="qship-agent-context-picker-search">
        <Search size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search feature requests…"
          disabled={disabled}
        />
      </div>

      <div className="qship-agent-context-picker-list">
        {featuresQuery.isLoading ? (
          <div className="qship-agent-context-picker-empty">
            <Loader2 size={14} className="qship-spin" /> Loading requests…
          </div>
        ) : filtered.length === 0 ? (
          <div className="qship-agent-context-picker-empty">
            No matching feature requests. Submit one from Requests first.
          </div>
        ) : (
          filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className="qship-agent-context-picker-item"
              disabled={disabled}
              onClick={() => {
                onSelect({
                  contextId: toFeatureFocusId(row.id),
                  contextLabel: row.title,
                });
                onClose();
              }}
            >
              <Rocket size={13} />
              <span className="qship-agent-context-picker-item-main">
                <strong>{row.title}</strong>
                <span>{row.status}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
