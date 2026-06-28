"use client";

import { Calendar, Mail, Rocket, X } from "lucide-react";

import { isFeatureFocusId } from "~/lib/shipflow-focus";

export type AgentFocusState = {
  contextId?: string;
  eventId?: string;
  contextLabel?: string;
  eventLabel?: string;
  walkthroughTaskId?: string;
  analyzeRepo?: boolean;
};

type AgentFocusChipProps = {
  focus: AgentFocusState;
  onClear: () => void;
  disabled?: boolean;
};

export function AgentFocusChip({ focus, onClear, disabled }: AgentFocusChipProps) {
  if (!focus.contextId && !focus.eventId) return null;

  const isFeature = isFeatureFocusId(focus.contextId);
  const isMailContext = Boolean(focus.contextId) && !isFeature;
  const Icon = isFeature ? Rocket : isMailContext ? Mail : Calendar;
  const label = isFeature
    ? focus.contextLabel?.trim() || "Feature request"
    : isMailContext
      ? focus.contextLabel?.trim() || "Email conversation"
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
