/**
 * TypeScript interfaces for yt-dlp JSON output.
 *
 * These map to the actual JSON fields returned by yt-dlp.
 * Field names use snake_case to match yt-dlp output directly.
 */

/** Thumbnail entry from yt-dlp */
export interface YtDlpThumbnail {
  url: string;
  height?: number;
  width?: number;
  id?: string;
}

/**
 * Video entry from `yt-dlp --flat-playlist --dump-json`.
 * Contains basic metadata — no channel info (it's null in flat mode).
 */
export interface YtDlpFlatVideoEntry {
  id: string;
  title: string;
  duration: number | null;
  thumbnails?: YtDlpThumbnail[];
  url?: string;
  _type?: string;
  ie_key?: string;
}

/**
 * Full video metadata from `yt-dlp --dump-json` (without --flat-playlist).
 * Includes channel info, upload date, view count, and more.
 */
export interface YtDlpFullVideo {
  id: string;
  title: string;
  channel: string;
  channel_id: string;
  channel_url: string;
  uploader: string;
  uploader_id: string;
  upload_date: string; // "YYYYMMDD" format
  duration: number;
  thumbnail: string;
  thumbnails?: YtDlpThumbnail[];
  view_count?: number;
  description?: string;
  categories?: string[];
  tags?: string[];
}

/** The type of URL resolved by yt-dlp */
export type ResolvedUrlType = "video" | "playlist" | "channel";

/** Result of resolving a pasted YouTube URL */
export interface ResolvedUrl {
  type: ResolvedUrlType;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string | null;
  channelBanner?: string | null;
  videoCount: number;
}
