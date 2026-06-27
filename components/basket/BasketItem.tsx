"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import type { BasketVideo } from "@/lib/store/basket";

/**
 * Format duration in seconds to mm:ss or h:mm:ss.
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

interface BasketItemProps {
  video: BasketVideo;
  onRemove: (id: string) => void;
}

/**
 * Compact list row for the basket panel.
 * Small thumbnail + title (1-line) + duration (mono-num) + X on hover.
 * Animates out on remove (slide left + height collapse).
 */
export function BasketItem({ video, onRemove }: BasketItemProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="group flex items-center gap-[var(--space-3)] p-[var(--space-2)] rounded-[6px] hover:bg-[var(--bg-surface-raised)] transition-colors duration-[140ms] ease-out"
    >
      {/* Thumbnail — small 16:9 */}
      <div className="w-[48px] h-[27px] rounded-[3px] overflow-hidden bg-[var(--bg-surface-raised)] shrink-0">
        {video.thumbnailUrl && !imgError ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      {/* Title + duration */}
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-body)] text-[var(--text-primary)] truncate leading-tight">
          {video.title}
        </p>
        {video.durationSeconds != null && video.durationSeconds > 0 && (
          <p className="mono-num text-[var(--text-caption)] text-[var(--text-secondary)] leading-tight mt-[1px]">
            {formatDuration(video.durationSeconds)}
          </p>
        )}
      </div>

      {/* Remove button — appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(video.id);
        }}
        className="shrink-0 w-[24px] h-[24px] rounded-full flex items-center justify-center text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-all duration-[140ms] ease-out"
        aria-label={`Remove ${video.title}`}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
