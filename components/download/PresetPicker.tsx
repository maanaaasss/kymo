"use client";

import { Video, Music, Archive } from "lucide-react";
import type { DownloadConfig } from "@/lib/types/download";
import { PRESETS } from "@/lib/types/download";

/** Map preset IDs to lucide icons. */
const PRESET_ICONS: Record<string, React.ReactNode> = {
  reference: <Video size={14} />,
  music: <Music size={14} />,
  archive: <Archive size={14} />,
};

interface PresetPickerProps {
  currentConfig: DownloadConfig;
  onSelect: (config: DownloadConfig) => void;
}

/**
 * Check if a config matches a preset (for highlight state).
 */
function configMatchesPreset(config: DownloadConfig, presetConfig: DownloadConfig): boolean {
  return (
    config.kind === presetConfig.kind &&
    config.quality === presetConfig.quality &&
    config.includeThumbnail === presetConfig.includeThumbnail &&
    config.includeMetadata === presetConfig.includeMetadata
  );
}

/**
 * Preset picker — three one-click preset buttons.
 * Reference (1080p video + extras), Music (mp3 audio + thumbnail), Archive (best video + all).
 *
 * Active preset gets an ember left-border accent.
 * Compact row layout with icon + name + muted description.
 */
export function PresetPicker({ currentConfig, onSelect }: PresetPickerProps) {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <span className="text-[var(--text-caption)] text-[var(--text-secondary)] px-[var(--space-1)]">
        Presets
      </span>
      <div className="flex gap-[var(--space-2)]">
        {PRESETS.map((preset) => {
          const isActive = configMatchesPreset(currentConfig, preset.config);

          return (
            <button
              key={preset.id}
              onClick={() => onSelect({ ...preset.config })}
              className={`
                flex-1 flex items-center gap-[var(--space-2)]
                px-[var(--space-3)] py-[var(--space-2)]
                rounded-[var(--radius-card)]
                border text-left cursor-pointer
                transition-all duration-[140ms] ease-out
                ${
                  isActive
                    ? "border-[var(--accent-ember)] bg-[var(--accent-ember)]/8 border-l-2"
                    : "border-[var(--border-subtle)] hover:bg-[var(--bg-surface-raised)] hover:border-[var(--text-secondary)]/30"
                }
              `}
            >
              <span
                className={`
                  shrink-0 transition-colors duration-[140ms] ease-out
                  ${isActive ? "text-[var(--accent-ember)]" : "text-[var(--text-secondary)]"}
                `}
              >
                {PRESET_ICONS[preset.id]}
              </span>
              <div className="min-w-0">
                <p
                  className={`
                    text-[var(--text-body)] font-medium leading-tight
                    transition-colors duration-[140ms] ease-out
                    ${isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}
                  `}
                >
                  {preset.name}
                </p>
                <p className="text-[var(--text-caption)] text-[var(--text-secondary)] leading-tight truncate">
                  {preset.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
