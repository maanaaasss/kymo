/**
 * Shared types for download configuration.
 *
 * Used by the FormatPicker, PresetPicker, BasketPanel, and batch creation API.
 */

export type DownloadKind = "video" | "audio";

/** Video quality options when kind === "video" */
export const VIDEO_QUALITIES = ["best", "1080p", "720p", "480p"] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];

/** Audio format options when kind === "audio" */
export const AUDIO_FORMATS = ["mp3", "m4a", "opus"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/**
 * Download configuration — what format/quality to download.
 */
export interface DownloadConfig {
  kind: DownloadKind;
  quality: string; // VideoQuality | AudioFormat depending on kind
  includeThumbnail: boolean;
  includeMetadata: boolean;
}

/**
 * A download preset — one-click configuration.
 */
export interface Preset {
  id: string;
  name: string;
  description: string;
  config: DownloadConfig;
}

/**
 * The three built-in presets from the project plan.
 */
export const PRESETS: Preset[] = [
  {
    id: "reference",
    name: "Reference",
    description: "1080p video with thumbnail and metadata",
    config: {
      kind: "video",
      quality: "1080p",
      includeThumbnail: true,
      includeMetadata: true,
    },
  },
  {
    id: "music",
    name: "Music",
    description: "Audio only as MP3 with thumbnail",
    config: {
      kind: "audio",
      quality: "mp3",
      includeThumbnail: true,
      includeMetadata: false,
    },
  },
  {
    id: "archive",
    name: "Archive",
    description: "Best quality video with all extras",
    config: {
      kind: "video",
      quality: "best",
      includeThumbnail: true,
      includeMetadata: true,
    },
  },
];

/**
 * The default config when no preset is selected.
 */
export const DEFAULT_CONFIG: DownloadConfig = {
  kind: "video",
  quality: "1080p",
  includeThumbnail: false,
  includeMetadata: false,
};
