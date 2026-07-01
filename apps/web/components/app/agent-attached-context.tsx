"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, GitBranch, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { trpc } from "~/trpc/client";
import { FeatureDeliveryPanel } from "~/components/app/feature-delivery-panel";

type QuickPrompt = {
  label: string;
  icon: typeof Sparkles;
  prompt: string;
};

function promptsForStatus(status: string, title: string): QuickPrompt[] {
  const quoted = `"${title}"`;

  if (status === "fix_needed") {
    return [
      {
        label: "Fix review blockers",
        icon: Wrench,
        prompt: `On the attached feature ${quoted}: fix all blocking AI review issues, update the code on the open PR, and summarize what you changed.`,
      },
      {
        label: "Re-run AI review",
        icon: ShieldCheck,
        prompt: `Re-run AI review on the attached feature ${quoted} and tell me if it passes.`,
      },
      {
        label: "What's blocking?",
        icon: Sparkles,
        prompt: `Summarize the blocking AI review issues on attached feature ${quoted} and the smallest fix to pass review.`,
      },
    ];
  }

  if (status === "pr_open" || status === "in_development" || status === "ai_review") {
    return [
      {
        label: "Run AI review",
        icon: ShieldCheck,
        prompt: `Run AI review on the attached feature ${quoted}.`,
      },
      {
        label: "Update PR code",
        icon: GitBranch,
        prompt: `Update the implementation code for attached feature ${quoted} on the open pull request.`,
      },
      {
        label: "Next step",
        icon: Sparkles,
        prompt: `What is the best next step for attached feature ${quoted}?`,
      },
    ];
  }

  if (status === "prd_ready" || status === "planning") {
    return [
      {
        label: "Generate tasks",
        icon: Sparkles,
        prompt: `Generate engineering tasks for attached feature ${quoted}.`,
      },
      {
        label: "Implement code",
        icon: GitBranch,
        prompt: `Implement code for attached feature ${quoted} and open a pull request on qship-playground.`,
      },
    ];
  }

  return [
    {
      label: "What should I do?",
      icon: Sparkles,
      prompt: `What should I do next on attached feature ${quoted}?`,
    },
    {
      label: "Full status",
      icon: ShieldCheck,
      prompt: `Give me a delivery status update for attached feature ${quoted}.`,
    },
  ];
}

export function AgentAttachedContext({
  featureId,
  timelineOpen,
  onTimelineOpenChange,
  onQuickPrompt,
  disabled,
}: {
  featureId: string;
  timelineOpen: boolean;
  onTimelineOpenChange: (open: boolean) => void;
  onQuickPrompt: (prompt: string) => void;
  disabled?: boolean;
}) {
  const delivery = trpc.feature.delivery.useQuery({ id: featureId }, { staleTime: 15_000 });

  if (delivery.isLoading) {
    return (
      <div className="qship-agent-attached-context" aria-busy="true">
        <p className="qship-agent-attached-hint">Loading attached feature…</p>
      </div>
    );
  }

  if (!delivery.data) return null;

  const { title, status, statusLabel, nextStep } = delivery.data;
  const prompts = promptsForStatus(status, title);

  return (
    <div className="qship-agent-attached-context">
      <div className="qship-agent-attached-meta">
        <div className="qship-agent-attached-meta-top">
          <span className="qship-agent-attached-badge">{statusLabel}</span>
          <Link href={`/requests?id=${featureId}`} className="qship-mono-tag">
            Open in Requests →
          </Link>
        </div>
        <p className="qship-agent-attached-next">{nextStep}</p>
        <button
          type="button"
          className="qship-agent-attached-toggle"
          onClick={() => onTimelineOpenChange(!timelineOpen)}
          aria-expanded={timelineOpen}
        >
          {timelineOpen ? (
            <>
              Hide activity <ChevronUp size={13} />
            </>
          ) : (
            <>
              Show activity <ChevronDown size={13} />
            </>
          )}
        </button>
      </div>

      <div className="qship-agent-attached-suggest" role="group" aria-label="Suggested prompts for attached feature">
        {prompts.map((item) => (
          <button
            key={item.label}
            type="button"
            className="qship-agent-attached-suggest-btn"
            disabled={disabled}
            onClick={() => onQuickPrompt(item.prompt)}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      {timelineOpen ? (
        <div className="qship-agent-attached-timeline">
          <FeatureDeliveryPanel featureId={featureId} compact timelineOnly />
        </div>
      ) : null}
    </div>
  );
}
