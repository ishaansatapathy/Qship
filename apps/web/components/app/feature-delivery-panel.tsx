"use client";

import Link from "next/link";
import { Bot, Clock3, Sparkles, User, X } from "lucide-react";

import { trpc } from "~/trpc/client";
import { DeliveryPanelCompactSkeleton, DeliveryPanelSkeleton } from "~/components/app/skeleton-panels";

function actorLabel(actor: string) {
  if (actor === "agent") return "Agent";
  if (actor === "user") return "You";
  return "System";
}

function ActorIcon({ actor }: { actor: string }) {
  if (actor === "agent") return <Bot size={11} />;
  if (actor === "user") return <User size={11} />;
  return <Sparkles size={11} />;
}

export function FeatureDeliveryPanel({
  featureId,
  compact,
  showOpenLink,
  onDismiss,
}: {
  featureId: string;
  compact?: boolean;
  showOpenLink?: boolean;
  onDismiss?: () => void;
}) {
  const delivery = trpc.feature.delivery.useQuery({ id: featureId }, { staleTime: 15_000 });

  if (delivery.isLoading) {
    return compact ? <DeliveryPanelCompactSkeleton /> : <DeliveryPanelSkeleton />;
  }

  if (!delivery.data) return null;

  const { summary, nextStep, timeline, statusLabel, title, counts } = delivery.data;
  const visibleTimeline = compact ? timeline.slice(-4) : timeline;

  return (
    <section className="qship-delivery-panel" data-compact={compact ? "true" : undefined}>
      <div className="qship-delivery-panel-head">
        <div className="qship-delivery-panel-head-main">
          <h3>{compact ? "Attached feature" : "Delivery timeline"}</h3>
          {!compact ? <span className="qship-delivery-status-pill">{statusLabel}</span> : null}
        </div>
        <div className="qship-delivery-panel-actions">
          {showOpenLink ? (
            <Link href={`/requests?id=${featureId}`} className="qship-mono-tag">
              Open →
            </Link>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              className="qship-delivery-panel-dismiss"
              onClick={onDismiss}
              aria-label="Close attached feature"
              title="Close"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {compact ? (
        <>
          <p className="qship-delivery-compact-title">{title}</p>
          <p className="qship-delivery-compact-next">{nextStep}</p>
        </>
      ) : (
        <div className="qship-delivery-summary">
          <p className="qship-delivery-summary-text">{summary}</p>
          <div className="qship-delivery-stats">
            <span className="qship-delivery-stat" data-ready={counts.goals > 0 ? "true" : undefined}>
              {counts.goals > 0 ? `${counts.goals} PRD goal${counts.goals === 1 ? "" : "s"}` : "No PRD"}
            </span>
            <span className="qship-delivery-stat" data-ready={counts.tasks > 0 ? "true" : undefined}>
              {counts.tasks > 0 ? `${counts.tasks} task${counts.tasks === 1 ? "" : "s"}` : "No tasks"}
            </span>
            {counts.clarifications > 0 ? (
              <span className="qship-delivery-stat" data-ready="true">
                {counts.clarifications} clarification{counts.clarifications === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="qship-delivery-next-callout">
            <span className="qship-delivery-next-label">Next step</span>
            <p>{nextStep}</p>
          </div>
        </div>
      )}

      <div className="qship-delivery-timeline-wrap">
        <span className="qship-delivery-timeline-label">Activity</span>
        <ol className="qship-delivery-timeline">
          {visibleTimeline.map((entry) => (
            <li key={entry.id} className="qship-delivery-event" data-kind={entry.kind}>
              <span className="qship-delivery-event-dot" aria-hidden />
              <div className="qship-delivery-event-body">
                <div className="qship-delivery-event-top">
                  <strong>{entry.title}</strong>
                  <span className="qship-delivery-event-meta">
                    <ActorIcon actor={entry.actor} />
                    {actorLabel(entry.actor)}
                    <Clock3 size={10} />
                    {new Date(entry.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {entry.detail ? <p>{entry.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
