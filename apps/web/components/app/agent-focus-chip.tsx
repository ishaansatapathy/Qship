"use client";

import { Calendar, Mail, Rocket, X } from "lucide-react";

import { isFeatureFocusId } from "~/lib/shipflow-focus";

export type AgentFocusState = {
  threadId?: string;
  eventId?: string;
  threadLabel?: string;
  eventLabel?: string;
};

type AgentFocusChipProps = {
  focus: AgentFocusState;
  onClear: () => void;
  disabled?: boolean;
};

export function AgentFocusChip({ focus, onClear, disabled }: AgentFocusChipProps) {
  if (!focus.threadId && !focus.eventId) return null;

  const isFeature = isFeatureFocusId(focus.threadId);
  const isThread = Boolean(focus.threadId) && !isFeature;
  const Icon = isFeature ? Rocket : isThread ? Mail : Calendar;
  const label = isFeature
    ? focus.threadLabel?.trim() || "Feature request"
    : isThread
      ? focus.threadLabel?.trim() || "Email thread"
      : focus.eventLabel?.trim() || "Calendar event";

  return (
    <div className="qship-agent-focus-chip" role="status" aria-label={`Focused on ${label}`}>
      <Icon size={13} aria-hidden />
      <span className="qship-agent-focus-chip-label" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="qship-agent-focus-chip-clear"
        onClick={onClear}
        disabled={disabled}
        aria-label="Remove focus"
        title="Remove focus"
      >
        <X size={12} />
      </button>
    </div>
  );
}
