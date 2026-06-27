"use client";

import { Video, Music } from "lucide-react";
import type {
  DownloadConfig,
  DownloadKind,
} from "@/lib/types/download";
import { VIDEO_QUALITIES, AUDIO_FORMATS } from "@/lib/types/download";

interface FormatPickerProps {
  config: DownloadConfig;
  onChange: (config: DownloadConfig) => void;
}

/**
 * Format picker — video/audio toggle + quality/format selector + options.
 *
 * Two-segment pill toggle (Linear-style, not default shadcn).
 * Video: show quality dropdown (1080p, 720p, 480p, best).
 * Audio: show format dropdown (mp3, m4a, opus).
 * Checkboxes for include thumbnail / include metadata.
 */
export function FormatPicker({ config, onChange }: FormatPickerProps) {
  const setKind = (kind: DownloadKind) => {
    onChange({
      ...config,
      kind,
      // Reset quality to sensible default when switching kind
      quality: kind === "video" ? "1080p" : "mp3",
    });
  };

  const setQuality = (quality: string) => {
    onChange({ ...config, quality });
  };

  const setOption = (key: "includeThumbnail" | "includeMetadata", value: boolean) => {
    onChange({ ...config, [key]: value });
  };

  const qualities = config.kind === "video" ? VIDEO_QUALITIES : AUDIO_FORMATS;

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      {/* Kind toggle — two-segment pill */}
      <div className="flex items-center gap-[var(--space-3)]">
        <div className="flex rounded-[var(--radius-card)] bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] p-[2px]">
          <button
            onClick={() => setKind("video")}
            className={`
              flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[5px]
              rounded-[6px] text-[var(--text-body)] font-medium
              transition-all duration-[140ms] ease-out cursor-pointer
              ${
                config.kind === "video"
                  ? "bg-[var(--accent-ember)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            `}
          >
            <Video size={14} />
            Video
          </button>
          <button
            onClick={() => setKind("audio")}
            className={`
              flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[5px]
              rounded-[6px] text-[var(--text-body)] font-medium
              transition-all duration-[140ms] ease-out cursor-pointer
              ${
                config.kind === "audio"
                  ? "bg-[var(--accent-ember)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            `}
          >
            <Music size={14} />
            Audio
          </button>
        </div>

        {/* Quality/format dropdown */}
        <select
          value={config.quality}
          onChange={(e) => setQuality(e.target.value)}
          className="
            mono-num appearance-none bg-[var(--bg-surface-raised)]
            border border-[var(--border-subtle)] rounded-[var(--radius-card)]
            px-[var(--space-3)] py-[5px] text-[var(--text-body)]
            text-[var(--text-primary)] cursor-pointer
            transition-colors duration-[140ms] ease-out
            hover:border-[var(--text-secondary)]/40
            focus:outline-none focus:ring-2 focus:ring-[var(--accent-ember)] focus:ring-offset-0
          "
        >
          {qualities.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </div>

      {/* Options row — include thumbnail / metadata */}
      <div className="flex items-center gap-[var(--space-4)]">
        <label className="flex items-center gap-[var(--space-2)] text-[var(--text-caption)] text-[var(--text-secondary)] cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={config.includeThumbnail}
            onChange={(e) => setOption("includeThumbnail", e.target.checked)}
            className="
              w-[14px] h-[14px] rounded-[3px]
              border border-[var(--border-subtle)]
              bg-[var(--bg-surface-raised)]
              accent-[var(--accent-ember)]
              cursor-pointer
              transition-colors duration-[140ms] ease-out
            "
          />
          <span className="transition-colors duration-[140ms] ease-out group-hover:text-[var(--text-primary)]">
            Include thumbnail
          </span>
        </label>

        <label className="flex items-center gap-[var(--space-2)] text-[var(--text-caption)] text-[var(--text-secondary)] cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={config.includeMetadata}
            onChange={(e) => setOption("includeMetadata", e.target.checked)}
            className="
              w-[14px] h-[14px] rounded-[3px]
              border border-[var(--border-subtle)]
              bg-[var(--bg-surface-raised)]
              accent-[var(--accent-ember)]
              cursor-pointer
              transition-colors duration-[140ms] ease-out
            "
          />
          <span className="transition-colors duration-[140ms] ease-out group-hover:text-[var(--text-primary)]">
            Include metadata
          </span>
        </label>
      </div>
    </div>
  );
}
