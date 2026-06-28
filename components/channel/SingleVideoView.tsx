"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useBasketStore } from "@/lib/store/basket";
import { useToastStore } from "@/lib/store/toast";
import { ToggleSwitch } from "@/components/download/ToggleSwitch";

interface SingleVideoViewProps {
  videoId: string;
  onBrowseChannel: (channelId: string) => void;
}

interface VideoDetails {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number | null;
  channelId: string | null;
  channelTitle: string;
  channelThumbnailUrl: string | null;
}

/**
 * Format a duration in seconds to a human-readable string.
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
 * Format a relative date.
 */
function formatRelativeDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
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
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Format views.
 */
function formatViews(count: number | null): string {
  if (count === null || count === undefined) return "— views";
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M views`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K views`;
  }
  return `${count.toLocaleString()} views`;
}

export function SingleVideoView({ videoId, onBrowseChannel }: SingleVideoViewProps) {
  const queryClient = useQueryClient();
  const add = useBasketStore((s) => s.add);
  const showToast = useToastStore((s) => s.show);

  // Download Config States
  const [format, setFormat] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState<string>("highest");
  const [includeThumbnail, setIncludeThumbnail] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch Video details
  const { data, isLoading, isError } = useQuery<{ video: VideoDetails }>({
    queryKey: ["video-details", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}`);
      if (!res.ok) throw new Error("Failed to load video details");
      return res.json();
    },
  });

  const video = data?.video;

  // Presets configuration matcher
  const activePreset = useMemo(() => {
    if (format === "audio" && quality === "best" && includeThumbnail && includeMetadata) return "music";
    if (format === "video" && quality === "720p" && !includeThumbnail && !includeMetadata) return "reference";
    if (format === "video" && quality === "highest" && includeThumbnail && includeMetadata) return "archive";
    return null;
  }, [format, quality, includeThumbnail, includeMetadata]);

  const handlePresetSelect = (preset: "music" | "reference" | "archive") => {
    if (preset === "music") {
      setFormat("audio");
      setQuality("best");
      setIncludeThumbnail(true);
      setIncludeMetadata(true);
    } else if (preset === "reference") {
      setFormat("video");
      setQuality("720p");
      setIncludeThumbnail(false);
      setIncludeMetadata(false);
    } else if (preset === "archive") {
      setFormat("video");
      setQuality("highest");
      setIncludeThumbnail(true);
      setIncludeMetadata(true);
    }
  };

  // Add to selects basket
  const handleAddToSelects = () => {
    if (!video) return;
    add({
      id: video.id,
      title: video.title,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      channelId: video.channelId || "single-video",
      channelTitle: video.channelTitle,
    });
    showToast("Added to Selects");
  };

  // Download immediately via standard batches endpoint
  const handleImmediateDownload = async () => {
    if (!video || isDownloading) return;
    setIsDownloading(true);

    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: [
            {
              id: video.id,
              title: video.title,
              channelId: video.channelId || "single-video",
              channelTitle: video.channelTitle,
              kind: "video",
            },
          ],
          config: {
            kind: format,
            quality,
            includeThumbnail,
            includeMetadata,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Download failed");
      }

      showToast("Queued immediate video download job");
      // Trigger a queries refetch for active jobs
      queryClient.invalidateQueries({ queryKey: ["batches", "active"] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to queue download");
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col sm:flex-row gap-6 animate-pulse p-4 max-w-[900px] mx-auto w-full">
        <div className="w-full sm:w-[270px] aspect-video bg-[var(--bg-surface)] rounded-[10px]" />
        <div className="flex-1 flex flex-col gap-4">
          <div className="h-6 bg-[var(--bg-surface)] rounded w-3/4" />
          <div className="h-4 bg-[var(--bg-surface)] rounded w-1/2" />
          <div className="h-[1px] bg-[var(--border-default)]" />
          <div className="h-10 bg-[var(--bg-surface)] rounded w-full" />
        </div>
      </div>
    );
  }

  if (isError || !video) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--accent-red)]">
        <p>Failed to load video details</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[900px] mx-auto p-4 flex flex-col sm:flex-row gap-6">
      {/* Left Column: Thumbnail */}
      <div className="w-full sm:w-[270px] shrink-0">
        <div className="relative aspect-video rounded-[10px] overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-default)]">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
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

          {/* Centered Outline Play Icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="text-white/60 bg-black/40 p-2.5 rounded-full backdrop-blur-xs border border-white/10">
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
          </div>

          {/* Duration Badge */}
          {video.durationSeconds !== null && video.durationSeconds > 0 && (
            <span className="absolute bottom-2 right-2 mono-num text-[10px] font-medium text-white bg-black/60 px-1.5 py-0.5 rounded-[3px]">
              {formatDuration(video.durationSeconds)}
            </span>
          )}
        </div>
      </div>

      {/* Right Column: Info Details */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Title */}
        <h1 className="text-[18px] font-medium leading-snug line-clamp-3 text-[var(--text-primary)]">
          {video.title}
        </h1>

        {/* Metadata Line */}
        <p className="mt-1.5 text-[12px] text-[var(--text-secondary)] mono-num">
          {formatViews(video.viewCount)} · {formatRelativeDate(video.publishedAt)}
        </p>

        {/* 1px Divider */}
        <div className="h-[1px] bg-[var(--border-default)] my-4 w-full" />

        {/* Format Controls Inline */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
            {/* Format Segmented Selector */}
            <div className="w-full sm:w-[140px] flex rounded-md bg-[var(--bg-surface-raised)] p-0.5 select-none shrink-0 border border-[var(--border-default)]/60">
              <button
                type="button"
                onClick={() => {
                  setFormat("video");
                  setQuality("highest");
                }}
                className={`flex-1 rounded-sm py-1 text-xs font-medium transition-all cursor-pointer ${
                  format === "video"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormat("audio");
                  setQuality("best");
                }}
                className={`flex-1 rounded-sm py-1 text-xs font-medium transition-all cursor-pointer ${
                  format === "audio"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Audio
              </button>
            </div>

            {/* Quality Select Dropdown */}
            <div className="relative select-none shrink-0 w-full sm:w-auto">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full sm:w-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-raised)] px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer outline-none appearance-none pr-8 relative transition-all"
                style={{
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239A9AA2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  backgroundSize: "14px",
                }}
              >
                {format === "video" ? (
                  <>
                    <option value="highest">Highest Quality</option>
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                  </>
                ) : (
                  <>
                    <option value="best">Highest (MP3)</option>
                    <option value="256k">256kbps</option>
                    <option value="192k">192kbps</option>
                    <option value="128k">128kbps</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 w-full">
            <ToggleSwitch
              checked={includeThumbnail}
              onChange={setIncludeThumbnail}
              label="Include thumbnail"
            />
            <ToggleSwitch
              checked={includeMetadata}
              onChange={setIncludeMetadata}
              label="Include metadata"
            />
          </div>

          {/* Presets Row */}
          <div className="flex items-center gap-2.5 mt-1 flex-wrap w-full">
            <span className="text-[11px] text-[var(--text-secondary)] font-medium">
              Presets
            </span>
            {(["music", "reference", "archive"] as const).map((preset) => {
              const label = preset.charAt(0).toUpperCase() + preset.slice(1);
              const isActive = activePreset === preset;
              return (
                <button
                  key={preset}
                  onClick={() => handlePresetSelect(preset)}
                  className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-all cursor-pointer select-none ${
                    isActive
                      ? "border-[var(--accent-ember)] bg-[var(--accent-ember)]/8 text-[var(--text-primary)]"
                      : "border-[var(--border-default)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Actions Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4 w-full">
            <button
              onClick={handleAddToSelects}
              className="w-full sm:w-auto text-center justify-center rounded-full border border-[var(--border-default)] bg-transparent hover:bg-[var(--bg-surface-raised)] px-5 py-2.5 sm:py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none transition-colors"
            >
              Add to Selects
            </button>
            <button
              onClick={handleImmediateDownload}
              disabled={isDownloading}
              className="w-full sm:w-auto text-center justify-center rounded-full bg-[var(--accent-ember)] hover:bg-[var(--accent-ember-hover)] disabled:opacity-50 px-6 py-2.5 sm:py-2 text-xs font-medium text-white cursor-pointer select-none transition-colors shadow-sm"
            >
              {isDownloading ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
