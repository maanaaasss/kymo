"use client";

import { useState } from "react";
import { Check, CheckCircle, Plus } from "lucide-react";

/**
 * Format a duration in seconds to a human-readable string.
 * Examples: 62 → "1:02", 3661 → "1:01:01"
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a date to relative time (e.g. "3 days ago", "2 months ago").
 */
function formatRelativeDate(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

interface VideoCardProps {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  publishedAt: string | Date | null;
  isSelected?: boolean;
  isDownloaded?: boolean;
  onSelect?: (shiftKey: boolean) => void;
}

/**
 * Video card — compact, Raycast-inspired.
 * Thumbnail with duration badge, 2-line title, published date.
 * Selection state: ember ring + check icon. Hover: plus icon overlay.
 */
export function VideoCard({
  title,
  durationSeconds,
  thumbnailUrl,
  publishedAt,
  isSelected = false,
  isDownloaded = false,
  onSelect,
}: VideoCardProps) {
  const relativeDate = formatRelativeDate(publishedAt);
  const [imgError, setImgError] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect?.(e.shiftKey);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        group relative rounded-[var(--radius-card)]
        transition-all duration-[140ms] ease-out
        p-[var(--space-2)] cursor-pointer
        ${
          isSelected
            ? "bg-[var(--accent-ember)]/8 ring-2 ring-[var(--accent-ember)] ring-offset-0"
            : "hover:bg-[var(--bg-surface-raised)]"
        }
      `}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-[6px] overflow-hidden bg-[var(--bg-surface-raised)]">
        {thumbnailUrl && !imgError ? (
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
            className={`
              w-full h-full object-cover transition-all duration-[140ms] ease-out
              ${isSelected ? "brightness-90" : "group-hover:scale-[1.02]"}
            `}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}

        {/* Selection overlay icon — Raycast quick-action pattern */}
        <div
          className={`
            absolute top-[var(--space-1)] left-[var(--space-1)]
            w-[24px] h-[24px] rounded-full
            flex items-center justify-center
            transition-all duration-[140ms] ease-out
            ${
              isSelected
                ? "bg-[var(--accent-ember)] text-white opacity-100 scale-100"
                : "bg-black/50 text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
            }
          `}
        >
          {isSelected ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2} />}
        </div>

        {/* Duration badge — mono-num, pill, bottom-right */}
        {durationSeconds != null && durationSeconds > 0 && (
          <span className="absolute bottom-[var(--space-1)] right-[var(--space-1)] mono-num text-[11px] leading-none font-medium text-white bg-black/75 backdrop-blur-sm px-[5px] py-[3px] rounded-[4px]">
            {formatDuration(durationSeconds)}
          </span>
        )}

        {/* Already downloaded badge — bottom-left */}
        {isDownloaded && (
          <span className="absolute bottom-[var(--space-1)] left-[var(--space-1)] flex items-center gap-[3px] text-[11px] leading-none font-medium text-[var(--accent-teal)] bg-black/75 backdrop-blur-sm px-[5px] py-[3px] rounded-[4px]">
            <CheckCircle size={10} strokeWidth={2.5} />
            Downloaded
          </span>
        )}
      </div>

      {/* Title + metadata */}
      <div className="mt-[var(--space-2)] px-[var(--space-1)]">
        <h3 className="text-[var(--text-body)] text-[var(--text-primary)] font-normal leading-snug line-clamp-2">
          {title}
        </h3>
        {relativeDate && (
          <p className="mt-[var(--space-1)] text-[var(--text-caption)] text-[var(--text-secondary)]">
            {relativeDate}
          </p>
        )}
      </div>
    </div>
  );
}
