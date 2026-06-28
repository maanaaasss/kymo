import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Channels table — cached YouTube channel metadata.
 * Primary key is the YouTube channel ID (e.g. "UC...").
 */
export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  bannerUrl: text("banner_url"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  handle: text("handle"),
  subscriberCount: integer("subscriber_count"),
  description: text("description"),
  verified: integer("verified").default(0),
});

/**
 * Videos table — cached video metadata from yt-dlp.
 * Primary key is the YouTube video ID (e.g. "dQw4w9WgXcQ").
 */
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").references(() => channels.id),
  title: text("title").notNull(),
  durationSeconds: integer("duration_seconds"),
  thumbnailUrl: text("thumbnail_url"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  /** JSON blob from yt-dlp -F, cached for format picker */
  availableFormats: text("available_formats"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
  tab: text("tab").notNull().default("videos"),
  viewCount: integer("view_count"),
});

/**
 * Batches table — groups of download jobs created from a single basket submission.
 * Status lifecycle: pending → running → done | failed | partial
 */
export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  status: text("status", {
    enum: ["pending", "running", "done", "failed", "partial"],
  }).notNull(),
  totalJobs: integer("total_jobs").notNull(),
  completedJobs: integer("completed_jobs").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/**
 * Jobs table — individual download tasks within a batch.
 * Each job corresponds to one video being downloaded in one format.
 * Status lifecycle: pending → running → done | failed
 */
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").references(() => batches.id),
  videoId: text("video_id").references(() => videos.id),
  kind: text("kind", { enum: ["video", "audio", "image"] }).notNull(),
  quality: text("quality"),
  includeThumbnail: integer("include_thumbnail", { mode: "boolean" })
    .notNull()
    .default(false),
  includeMetadata: integer("include_metadata", { mode: "boolean" })
    .notNull()
    .default(false),
  status: text("status", {
    enum: ["pending", "running", "done", "failed"],
  }).notNull(),
  progressPct: real("progress_pct").default(0),
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

/**
 * Download history — tracks what's been downloaded to show
 * "already downloaded" badges on the video grid.
 */
export const downloadHistory = sqliteTable("download_history", {
  videoId: text("video_id").notNull(),
  kind: text("kind").notNull(),
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }).notNull(),
});
