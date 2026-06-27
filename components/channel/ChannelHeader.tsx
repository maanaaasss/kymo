"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ChannelHeaderProps {
  title: string;
  videoCount: number;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
}

/**
 * Channel header — displays channel banner, avatar, video count, and back link.
 * Matches section 3.2 visual guidelines: 16:5 banner, overlapping avatar.
 */
export function ChannelHeader({
  title,
  videoCount,
  thumbnailUrl,
  bannerUrl,
}: ChannelHeaderProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="mx-auto max-w-[1200px] px-[var(--space-5)] pt-[var(--space-5)]">
        <div className="relative flex flex-col">
          {/* Back link - floating on top of banner */}
          <Link
            href="/"
            className="absolute left-[var(--space-3)] top-[var(--space-3)] z-10 flex items-center justify-center w-[32px] h-[32px] rounded-[var(--radius-card)] text-white bg-black/40 hover:bg-black/60 transition-all duration-[140ms] ease-out backdrop-blur-sm border border-white/10"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
          </Link>

          {/* Banner */}
          <div className="relative w-full aspect-[16/5] max-h-[120px] rounded-t-[12px] overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[var(--bg-surface-raised)]" />
            )}
          </div>

          {/* Profile Avatar & Name (overlapping banner) */}
          <div className="flex items-end gap-[var(--space-4)] px-0 pb-[var(--space-4)] -mt-[24px] relative z-10">
            {/* Avatar */}
            <div className="relative w-[48px] h-[48px] rounded-full overflow-hidden border-[3px] border-[var(--bg-surface)] bg-[var(--bg-surface)] shrink-0">
              {thumbnailUrl && !imgError ? (
                <img
                  src={thumbnailUrl}
                  alt={title}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--bg-surface-raised)] flex items-center justify-center text-[var(--text-secondary)] font-medium text-xs">
                  {title.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info block */}
            <div className="flex flex-col gap-[2px] pb-[2px]">
              <h1 className="text-[16px] font-medium text-[var(--text-primary)] leading-tight">
                {title}
              </h1>
              <div className="text-[12px] text-[var(--text-secondary)] leading-none">
                <span className="mono-num">{videoCount.toLocaleString()}</span> videos
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
