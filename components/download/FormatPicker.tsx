"use client";

import { DownloadConfig, DownloadKind } from "@/lib/types/download";
import { VIDEO_QUALITIES, AUDIO_FORMATS } from "@/lib/types/download";
import { ToggleSwitch } from "@/components/download/ToggleSwitch";

interface FormatPickerProps {
  config: DownloadConfig;
  onChange: (config: DownloadConfig) => void;
}

export function FormatPicker({ config, onChange }: FormatPickerProps) {
  const setKind = (kind: DownloadKind) => {
    onChange({
      ...config,
      kind,
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
              px-[var(--space-3)] py-[5px]
              rounded-[6px] text-[var(--text-body)] font-medium
              transition-all duration-[140ms] ease-out cursor-pointer
              ${
                config.kind === "video"
                  ? "bg-[var(--accent-ember)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            `}
          >
            Video
          </button>
          <button
            onClick={() => setKind("audio")}
            className={`
              px-[var(--space-3)] py-[5px]
              rounded-[6px] text-[var(--text-body)] font-medium
              transition-all duration-[140ms] ease-out cursor-pointer
              ${
                config.kind === "audio"
                  ? "bg-[var(--accent-ember)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }
            `}
          >
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
            pl-[var(--space-3)] pr-[28px] py-[5px] text-[var(--text-body)]
            text-[var(--text-primary)] cursor-pointer
            transition-colors duration-[140ms] ease-out
            hover:border-[var(--text-secondary)]/40
            focus:outline-none focus:ring-2 focus:ring-[var(--accent-ember)] focus:ring-offset-0
          "
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239C9286' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
            backgroundSize: "14px",
          }}
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
        <ToggleSwitch
          checked={config.includeThumbnail}
          onChange={(v) => setOption("includeThumbnail", v)}
          label="Include thumbnail"
        />
        <ToggleSwitch
          checked={config.includeMetadata}
          onChange={(v) => setOption("includeMetadata", v)}
          label="Include metadata"
        />
      </div>
    </div>
  );
}
