/**
 * Progress parsing, filename utilities, and retry helpers for the download worker.
 */

/**
 * Parse a progress percentage from yt-dlp's --progress-template output.
 *
 * yt-dlp outputs lines like:
 *   [download]  42.3% of  120.50MiB at  2.50MiB/s ETA 00:32
 *
 * The --progress-template "download:%(progress._percent_str)s" produces:
 *   download:  42.3%
 *
 * Returns the numeric percentage (0–100) or null if unparseable.
 */
export function parseProgressLine(line: string): number | null {
  const templateMatch = line.match(/download:\s*([\d.]+)%/);
  if (templateMatch) {
    const pct = parseFloat(templateMatch[1]);
    return Number.isFinite(pct) ? pct : null;
  }

  const defaultMatch = line.match(/\[download\]\s+([\d.]+)%/);
  if (defaultMatch) {
    const pct = parseFloat(defaultMatch[1]);
    return Number.isFinite(pct) ? pct : null;
  }

  return null;
}

// Windows reserved device names (case-insensitive)
const RESERVED_NAMES = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
  "CLOCK$",
]);

/**
 * Sanitize a string for use as a filename.
 *
 * Handles:
 * - Unsafe filesystem characters: / \ : * ? " < > |
 * - Control characters (C0 range + DEL + Unicode formatting)
 * - Leading/trailing dots and spaces
 * - Windows reserved device names
 * - Empty result fallback
 * - Length cap at 200 chars
 */
export function sanitizeFilename(name: string): string {
  let result = name
    // Strip control characters: C0 (\x00-\x1F), DEL (\x7F), and Unicode formatting
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    // Replace unsafe filesystem characters
    .replace(/[\/\\:*?"<>|]/g, "_")
    // Collapse multiple underscores
    .replace(/_{2,}/g, "_")
    // Strip leading/trailing dots and spaces
    .replace(/^[\s.]+|[\s.]+$/g, "")
    // Trim
    .trim()
    // Cap length to avoid filesystem limits
    .slice(0, 200);

  // Guard against empty result
  if (!result) {
    result = "untitled";
  }

  // Guard against Windows reserved names (check with and without extension)
  const baseName = result.split(".")[0]?.toUpperCase();
  if (baseName && RESERVED_NAMES.has(baseName)) {
    result = `_${result}`;
  }

  return result;
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error patterns that indicate transient failures worth retrying.
 */
const RETRYABLE_PATTERNS = [
  /HTTP Error 5\d{2}/,           // 5xx server errors
  /HTTP Error 429/,              // rate limit
  /timed?\s*out/i,               // timeout
  /ECONNRESET/i,                 // connection reset
  /ECONNREFUSED/i,               // connection refused
  /ETIMEDOUT/i,                  // connection timeout
  /ENOTFOUND/i,                  // DNS failure
  /socket hang up/i,             // socket hang up
  /temporary failure/i,          // temporary DNS failure
  /network is unreachable/i,     // network unreachable
  /connection reset by peer/i,   // reset by peer
  /Unable to download/i,         // generic network failure
];

/**
 * Error patterns that indicate permanent failures (should NOT be retried).
 */
const PERMANENT_ERROR_PATTERNS = [
  /Private video/i,
  /Sign in/i,
  /HTTP Error 404/,
  /does not exist/i,
  /is not a valid URL/i,
  /This video is unavailable/i,
  /This video has been removed/i,
  /Video unavailable/i,
  /This channel does not exist/i,
];

/**
 * Determine whether an error is transient (retryable) vs permanent.
 */
export function isRetryableError(errorMessage: string): boolean {
  // If it matches a permanent pattern, don't retry
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) return false;
  }
  // If it matches a transient pattern, retry
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return true;
  }
  // Unknown errors are not retried
  return false;
}
