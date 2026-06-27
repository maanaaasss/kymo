/**
 * Video card loading skeleton.
 * Shimmer effect matching the VideoCard layout dimensions.
 */
export function VideoCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] p-[var(--space-2)] animate-pulse">
      {/* Thumbnail skeleton */}
      <div className="aspect-video rounded-[6px] bg-[var(--bg-surface-raised)]" />

      {/* Title skeleton — two lines */}
      <div className="mt-[var(--space-2)] px-[var(--space-1)] space-y-[var(--space-2)]">
        <div className="h-[14px] bg-[var(--bg-surface-raised)] rounded-[4px] w-full" />
        <div className="h-[14px] bg-[var(--bg-surface-raised)] rounded-[4px] w-[70%]" />
      </div>

      {/* Date skeleton */}
      <div className="mt-[var(--space-2)] px-[var(--space-1)]">
        <div className="h-[12px] bg-[var(--bg-surface-raised)] rounded-[4px] w-[40%]" />
      </div>
    </div>
  );
}
