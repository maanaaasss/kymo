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
  uploadIndex?: number;
}

/**
 * Video card — styled to match the home page's capability cards (dark canvas, border, no shadow).
 * Thumbnail with duration badge, frame index, selection indicator, and download status.
 */
export function VideoCard({
  title,
  durationSeconds,
  thumbnailUrl,
  publishedAt,
  isSelected = false,
  isDownloaded = false,
  onSelect,
  uploadIndex,
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
        group relative rounded-[12px] select-none overflow-hidden box-border
        transition-all duration-[140ms] ease-out
        p-[8px] sm:p-[12px] cursor-pointer
        flex flex-row sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0
        border
        ${
          isSelected
            ? "border-[var(--accent-ember)] bg-[var(--accent-ember)]/8"
            : "border-transparent bg-transparent"
        }
      `}
      style={{ boxShadow: "none" }}
    >
      {/* Viewfinder corner marks on all four corners of card when selected */}
      {isSelected && (
        <>
          <svg 
            className="absolute top-2 left-2 text-[var(--accent-ember)] pointer-events-none z-20"
            width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M1 6V1H6" />
          </svg>
          <svg 
            className="absolute top-2 right-2 text-[var(--accent-ember)] pointer-events-none z-20"
            width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M7 6V1H2" />
          </svg>
          <svg 
            className="absolute bottom-2 left-2 text-[var(--accent-ember)] pointer-events-none z-20"
            width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M1 2V7H6" />
          </svg>
          <svg 
            className="absolute bottom-2 right-2 text-[var(--accent-ember)] pointer-events-none z-20"
            width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M7 2V7H2" />
          </svg>
        </>
      )}

      {/* Thumbnail container */}
      <div className="relative aspect-video rounded-[6px] overflow-hidden bg-[var(--bg-surface-raised)] z-10 w-[110px] sm:w-full shrink-0 sm:shrink">
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

        {/* Frame-index number — top-left corner */}
        {uploadIndex !== undefined && (
          <span className="absolute top-[var(--space-1)] left-[var(--space-1)] font-mono text-[9px] font-medium text-white bg-black/60 px-[5px] py-[3px] rounded-[3px] leading-none inline-block select-none z-10">
            {uploadIndex.toString().padStart(3, "0")}
          </span>
        )}

        {/* Selection overlay icon — top-right corner */}
        <div
          className={`
            absolute top-[var(--space-1)] right-[var(--space-1)]
            w-[24px] h-[24px] rounded-full z-10
            flex items-center justify-center
            transition-all duration-[140ms] ease-out
            ${
              isSelected
                ? "bg-[var(--accent-ember)] text-white opacity-100 scale-100"
                : "bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 scale-100 sm:scale-90 sm:group-hover:scale-100"
            }
          `}
        >
          {isSelected ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2} />}
        </div>

        {/* Duration badge — mono-num, pill, bottom-right */}
        {durationSeconds != null && durationSeconds > 0 && (
          <span className="absolute bottom-[var(--space-1)] right-[var(--space-1)] mono-num text-[9px] font-medium text-white bg-black/60 px-[5px] py-[3px] rounded-[3px] z-10">
            {formatDuration(durationSeconds)}
          </span>
        )}

        {/* Already downloaded badge — bottom-left */}
        {isDownloaded && (
          <span className="absolute bottom-[var(--space-1)] left-[var(--space-1)] flex items-center gap-[3px] text-[9px] font-medium text-[var(--accent-teal)] bg-black/60 px-[5px] py-[3px] rounded-[3px] z-10">
            <CheckCircle size={10} strokeWidth={2.5} />
            Downloaded
          </span>
        )}
      </div>

      {/* Title + metadata */}
      <div className="flex-1 min-w-0 sm:mt-1.5 sm:px-1 z-10 relative">
        <h3 className="text-xs sm:text-[var(--text-body)] text-[var(--text-primary)] font-normal leading-tight line-clamp-2">
          {title}
        </h3>
        {relativeDate && relativeDate !== "—" && (
          <p className="mt-[2px] text-[10px] sm:text-[var(--text-caption)] text-[var(--text-secondary)] mono-num truncate">
            {relativeDate}
          </p>
        )}
      </div>
    </div>
  );
}

