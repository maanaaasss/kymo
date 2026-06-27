/**
 * Build yt-dlp CLI arguments from a job's download configuration.
 */

interface JobConfig {
  kind: "video" | "audio";
  quality: string | null;
  includeThumbnail: boolean;
  includeMetadata: boolean;
}

/**
 * Map video quality to yt-dlp format selector strings.
 *
 * The selectors use a fallback chain: prefer the requested quality,
 * fall back to the best available if the exact quality isn't offered.
 */
function videoFormatSelector(quality: string | null): string {
  switch (quality) {
    case "1080p":
      return 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b';
    case "720p":
      return 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b';
    case "480p":
      return 'bv*[height<=480]+ba/b[height<=480]/bv*+ba/b';
    case "best":
    default:
      return 'bv*+ba/b';
  }
}

/**
 * Build the full yt-dlp argument list for a single download job.
 *
 * @param job       - Download config (kind, quality, extras)
 * @param outputPath - Full output path template (including {ext} placeholder)
 * @returns Array of CLI arguments for yt-dlp
 */
export function buildYtDlpArgs(job: JobConfig, outputPath: string): string[] {
  const args: string[] = [];

  // Common flags
  args.push("--no-warnings", "--newline");
  args.push(
    "--progress-template",
    "download:%(progress._percent_str)s"
  );

  // Resume partial downloads if they exist
  args.push("-c");

  // Output path — yt-dlp replaces {ext} with the actual extension
  args.push("-o", outputPath);

  if (job.kind === "audio") {
    // Audio extraction
    args.push("--extract-audio");
    args.push("--audio-format", job.quality || "mp3");
    args.push("--audio-quality", "0"); // best quality
  } else {
    // Video download with quality selector
    args.push("-f", videoFormatSelector(job.quality));
  }

  // Optional extras
  if (job.includeThumbnail) {
    args.push("--write-thumbnail");
    args.push("--convert-thumbnails", "jpg");
  }

  if (job.includeMetadata) {
    args.push("--write-info-json");
  }

  return args;
}
