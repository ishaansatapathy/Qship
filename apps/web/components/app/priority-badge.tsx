"use client";

import { categoryLabel, urgencyDisplay, type InboxPriorityCategory, type InboxUrgency } from "~/lib/priority-display";

type Props = {
  urgency: InboxUrgency;
  score: number;
  reason?: string;
  category?: InboxPriorityCategory;
  rank?: number;
  compact?: boolean;
};

export function PriorityBadge({ urgency, reason, category, rank, compact }: Props) {
  const display = urgencyDisplay(urgency);

  return (
    <span className="qship-priority-badge-wrap" title={reason}>
      {rank != null ? <span className="qship-priority-rank">#{rank}</span> : null}
      <span
        className="qship-priority-badge"
        data-tone={display.tone}
        style={{
          color: display.color,
          background: display.bg,
          borderColor: display.border,
        }}
      >
        {display.shortLabel}
      </span>
      {!compact && category ? (
        <span className="qship-priority-category">{categoryLabel(category)}</span>
      ) : null}
    </span>
  );
}

export function PriorityReason({ reason }: { reason: string }) {
  return <p className="qship-priority-reason">{reason}</p>;
}
