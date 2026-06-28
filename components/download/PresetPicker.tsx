"use client";

import type { DownloadConfig } from "@/lib/types/download";
import { PRESETS } from "@/lib/types/download";

/** Map preset IDs to custom brand icons. */
const PRESET_ICONS: Record<string, React.ReactNode> = {
  reference: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  music: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="pointer-events-none"
    >
      <rect x="1" y="5" width="1.5" height="4" rx="0.75" />
      <rect x="3.5" y="3" width="1.5" height="8" rx="0.75" />
      <rect x="6" y="1" width="1.5" height="12" rx="0.75" />
      <rect x="8.5" y="4" width="1.5" height="6" rx="0.75" />
      <rect x="11" y="6" width="1.5" height="2" rx="0.75" />
    </svg>
  ),
  archive: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="pointer-events-none"
    >
      <rect x="1" y="2" width="12" height="1.5" rx="0.75" />
      <rect x="1" y="6" width="12" height="1.5" rx="0.75" />
      <rect x="1" y="10" width="12" height="1.5" rx="0.75" />
    </svg>
  ),
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
      <div className="flex flex-col gap-[var(--space-2)]">
        {PRESETS.map((preset) => {
          const isActive = configMatchesPreset(currentConfig, preset.config);

          return (
            <button
              key={preset.id}
              onClick={() => onSelect({ ...preset.config })}
              className={`
                w-full flex items-center gap-[var(--space-3)]
                px-[var(--space-4)] py-[var(--space-2)]
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
              <div className="flex-1 min-w-0">
                <p
                  className={`
                    text-[var(--text-body)] font-medium leading-tight
                    transition-colors duration-[140ms] ease-out
                    ${isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}
                  `}
                >
                  {preset.name}
                </p>
                <p className="text-[var(--text-caption)] text-[var(--text-secondary)] leading-tight mt-0.5 whitespace-normal">
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
