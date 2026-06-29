/** Layout-shaped skeletons that match real UI blocks (prevents layout shift). */

export function StatSkeletonGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="qship-req-stats" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="qship-req-stat qship-stat-skeleton">
          <span className="qship-skeleton qship-stat-skeleton-label" />
          <span className="qship-skeleton qship-stat-skeleton-value" />
        </div>
      ))}
    </div>
  );
}

export function BriefFocusSkeleton() {
  return (
    <div className="qship-brief-focus-card qship-brief-focus-card--skeleton" aria-hidden>
      <span className="qship-skeleton qship-brief-skeleton-label" />
      <span className="qship-skeleton qship-brief-skeleton-title" />
      <span className="qship-skeleton qship-brief-skeleton-line" />
      <div className="qship-brief-focus-actions">
        <span className="qship-skeleton qship-brief-skeleton-btn" />
        <span className="qship-skeleton qship-brief-skeleton-btn qship-brief-skeleton-btn--ghost" />
      </div>
    </div>
  );
}

export function AttentionCardSkeleton() {
  return (
    <div className="qship-brief-attention-card qship-brief-attention-card--skeleton" aria-hidden>
      <div className="qship-brief-attention-card-inner">
        <span className="qship-skeleton qship-brief-skeleton-pill" />
        <span className="qship-skeleton qship-brief-skeleton-title" />
        <span className="qship-skeleton qship-brief-skeleton-line" />
      </div>
    </div>
  );
}

export function DeliveryPanelCompactSkeleton() {
  return (
    <div className="qship-delivery-panel qship-delivery-panel--skeleton" data-compact="true" aria-hidden>
      <div className="qship-delivery-panel-head">
        <span className="qship-skeleton qship-delivery-skeleton-title" />
      </div>
      <span className="qship-skeleton qship-delivery-skeleton-line" />
    </div>
  );
}

export function DeliveryPanelSkeleton() {
  return (
    <div className="qship-delivery-panel qship-delivery-panel--skeleton" aria-hidden>
      <div className="qship-delivery-panel-head">
        <span className="qship-skeleton qship-delivery-skeleton-title" />
        <span className="qship-skeleton qship-delivery-skeleton-pill" />
      </div>
      <div className="qship-delivery-summary">
        <span className="qship-skeleton qship-delivery-skeleton-line" />
        <span className="qship-skeleton qship-delivery-skeleton-line qship-delivery-skeleton-line--short" />
        <span className="qship-skeleton qship-delivery-skeleton-callout" />
      </div>
      <div className="qship-delivery-timeline-wrap">
        <span className="qship-skeleton qship-delivery-skeleton-label" />
        <span className="qship-skeleton qship-delivery-skeleton-event" />
        <span className="qship-skeleton qship-delivery-skeleton-event" />
      </div>
    </div>
  );
}
