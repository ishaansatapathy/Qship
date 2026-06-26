/**
 * Generic skeleton loader for list views (inbox, queue, calendar).
 * Shows `count` pulsing rows while data is loading.
 */
export function SkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="qship-skeleton-row">
          <span className="qship-skeleton qship-skeleton-avatar" />
          <span className="qship-skeleton-lines">
            <span className="qship-skeleton qship-skeleton-line-medium" />
            <span className="qship-skeleton qship-skeleton-line-short" />
          </span>
          <span className="qship-skeleton qship-skeleton-date" />
        </div>
      ))}
    </div>
  );
}
