"use client";

import Link from "next/link";
import { Bot, Clock3, Sparkles, User, X } from "lucide-react";

import { trpc } from "~/trpc/client";
import { SkeletonList } from "~/components/app/skeleton-list";
import { DeliveryPanelCompactSkeleton } from "~/components/app/skeleton-panels";

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
    return compact ? <DeliveryPanelCompactSkeleton /> : <SkeletonList count={3} />;
  }

  if (!delivery.data) return null;

  const { summary, nextStep, timeline, statusLabel, title } = delivery.data;
  const visibleTimeline = compact ? timeline.slice(-4) : timeline;

  return (
    <section className="qship-delivery-panel" data-compact={compact ? "true" : undefined}>
      <div className="qship-delivery-panel-head">
        <div>
          <h3>{compact ? "Attached feature" : "Delivery timeline"}</h3>
          {!compact ? <p className="qship-delivery-status">{statusLabel}</p> : null}
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
        <p className="qship-delivery-compact-title">{title}</p>
      ) : null}

      <div className="qship-delivery-summary">
        <p>{summary}</p>
        <p className="qship-delivery-next">
          <strong>Next:</strong> {nextStep}
        </p>
      </div>

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
    </section>
  );
}
