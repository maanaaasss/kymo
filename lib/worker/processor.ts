/**
 * Single-job processor — the core download logic.
 *
 * Spawns yt-dlp for one job, parses progress, updates SQLite,
 * and handles completion/failure with retry support.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { db } from "@/lib/db";
import {
  jobs,
  batches,
  videos,
  channels,
  downloadHistory,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { buildYtDlpArgs } from "./ytdlp-args";
import {
  parseProgressLine,
  sanitizeFilename,
  sleep,
  isRetryableError,
} from "./progress";

const DOWNLOADS_ROOT = path.join(os.homedir(), "yt-downloads");

/** Max retries for transient errors before marking as permanently failed. */
const MAX_RETRIES = 2;

/** Base delay between retries (ms). Doubles each attempt. */
const RETRY_BASE_DELAY_MS = 5_000;

/**
 * Process a single download job.
 *
 * 1. Mark job as "running"
 * 2. Look up video metadata (title, channel)
 * 3. Build output path: ~/yt-downloads/{channel}/{title}
 * 4. Spawn yt-dlp with progress tracking
 * 5. On success: mark "done", insert download_history, check batch completion
 * 6. On failure: retry if transient, otherwise mark "failed"
 */
export async function processJob(jobId: string): Promise<void> {
  let batchId: string;
  let videoId: string;

  try {
    // 1. Fetch the job row
    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
    });

    if (!job) {
      console.error(`[worker] Job ${jobId} not found — skipping`);
      return;
    }

    if (!job.batchId || !job.videoId) {
      console.error(
        `[worker] Job ${jobId} is missing batchId or videoId — skipping`
      );
      return;
    }

    batchId = job.batchId;
    videoId = job.videoId;

    // 2. Mark as running
    await db
      .update(jobs)
      .set({ status: "running", progressPct: 0 })
      .where(eq(jobs.id, jobId))
      .run();

    // Update batch status to "running" if it's still "pending"
    await db
      .update(batches)
      .set({ status: "running" })
      .where(and(eq(batches.id, batchId), eq(batches.status, "pending")))
      .run();
  } catch (err) {
    console.error(`[worker] DB error setting up job ${jobId}:`, err);
    return;
  }

  // Run the download with retry logic
  await downloadWithRetry(jobId, batchId, videoId);
}

/**
 * Attempt the download with automatic retry for transient errors.
 */
async function downloadWithRetry(
  jobId: string,
  batchId: string,
  videoId: string
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(
        `[worker] Retrying job ${jobId} (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after ${delay}ms`
      );
      await sleep(delay);

      // Reset progress for retry
      try {
        await db
          .update(jobs)
          .set({ progressPct: 0, error: null })
          .where(eq(jobs.id, jobId))
          .run();
      } catch {
        // If DB fails here, we still try the download
      }
    }

    try {
      const job = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
      });

      if (!job) {
        throw new Error("Job not found in database");
      }

      if (job.kind === "image") {
        const meta = JSON.parse(job.quality || "{}");
        const imageUrl = meta.url;
        const imageType = meta.type || "avatar";
        const channelTitle = meta.channelTitle || "Unknown Channel";

        const channelDir = path.join(DOWNLOADS_ROOT, sanitizeFilename(channelTitle));
        fs.mkdirSync(channelDir, { recursive: true });

        const ext = getUrlExtension(imageUrl);
        const filename = `${sanitizeFilename(channelTitle)}_${imageType}.${ext}`;
        const actualPath = path.join(channelDir, filename);

        console.log(`[worker] Downloading image: ${imageUrl} -> ${actualPath}`);
        await downloadFile(imageUrl, actualPath);

        const finishedAt = new Date();
        await db
          .update(jobs)
          .set({
            status: "done",
            progressPct: 100,
            outputPath: actualPath,
            finishedAt,
          })
          .where(eq(jobs.id, jobId))
          .run();

        // Increment completedJobs
        await db
          .update(batches)
          .set({ completedJobs: sql`${batches.completedJobs} + 1` })
          .where(eq(batches.id, batchId))
          .run();

        await checkBatchCompletion(batchId);
        return;
      }

      // 3. Look up video metadata
      const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
      });

      if (!video) {
        throw new Error("Video not found in database");
      }

      // Get channel title for directory naming
      let channelTitle = "Unknown Channel";
      let channelBannerUrl: string | null = null;
      let channelThumbnailUrl: string | null = null;
      if (video.channelId) {
        const channel = await db.query.channels.findFirst({
          where: eq(channels.id, video.channelId),
        });
        if (channel) {
          channelTitle = channel.title;
          channelBannerUrl = channel.bannerUrl;
          channelThumbnailUrl = channel.thumbnailUrl;
        }
      }

      // 4. Build output directory and filename
      const channelDir = path.join(
        DOWNLOADS_ROOT,
        sanitizeFilename(channelTitle)
      );
      fs.mkdirSync(channelDir, { recursive: true });

      // Download channel profile & banner if available
      if (channelThumbnailUrl) {
        const ext = getUrlExtension(channelThumbnailUrl);
        const avatarPath = path.join(channelDir, `channel_profile.${ext}`);
        if (!fs.existsSync(avatarPath)) {
          downloadFile(channelThumbnailUrl, avatarPath).catch((err) => {
            console.error(`[worker] Failed to download channel profile avatar:`, err);
          });
        }
      }

      if (channelBannerUrl) {
        const ext = getUrlExtension(channelBannerUrl);
        const bannerPath = path.join(channelDir, `channel_banner.${ext}`);
        if (!fs.existsSync(bannerPath)) {
          downloadFile(channelBannerUrl, bannerPath).catch((err) => {
            console.error(`[worker] Failed to download channel banner:`, err);
          });
        }
      }

      // Output template WITHOUT extension — yt-dlp adds it automatically.
      // This prevents thumbnails from being named like "title.mp3.jpg".
      const outputTemplate = path.join(
        channelDir,
        sanitizeFilename(video.title)
      );

      // 5. Build yt-dlp arguments
      const args = buildYtDlpArgs(
        {
          kind: job.kind as "video" | "audio",
          quality: job.quality,
          includeThumbnail: job.includeThumbnail,
          includeMetadata: job.includeMetadata,
        },
        outputTemplate
      );

      // Add the YouTube URL
      args.push(`https://www.youtube.com/watch?v=${videoId}`);

      console.log(`[worker] Processing job ${jobId}: ${video.title}`);
      if (attempt > 0) {
        console.log(`[worker] Retry attempt ${attempt + 1}`);
      }

      // 6. Spawn yt-dlp and track progress
      await runYtDlp(args, jobId);

      // 7. On success: mark as done
      const finishedAt = new Date();

      // Find the actual output file (yt-dlp may change extension)
      const actualOutput = findOutputFile(channelDir, video.title);

      await db
        .update(jobs)
        .set({
          status: "done",
          progressPct: 100,
          outputPath: actualOutput || outputTemplate,
          finishedAt,
        })
        .where(eq(jobs.id, jobId))
        .run();

      // Insert into download_history
      try {
        await db
          .insert(downloadHistory)
          .values({
            videoId: videoId,
            kind: job.kind,
            downloadedAt: finishedAt,
          })
          .run();
      } catch {
        // Non-critical: download succeeded even if history insert fails
        console.warn(
          `[worker] Failed to insert download_history for job ${jobId}`
        );
      }

      // Increment batch completed_jobs
      await db
        .update(batches)
        .set({ completedJobs: sql`${batches.completedJobs} + 1` })
        .where(eq(batches.id, batchId))
        .run();

      // Check if all jobs in the batch are done
      await checkBatchCompletion(batchId);

      console.log(`[worker] Job ${jobId} completed successfully`);
      return; // Success — exit retry loop
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";

      // Check if this is a retryable error
      if (isRetryableError(errorMessage) && attempt < MAX_RETRIES) {
        console.warn(
          `[worker] Job ${jobId} failed with retryable error: ${errorMessage}`
        );
        // Clean up any partial files before retry
        cleanupPartialFiles();
        continue; // Retry
      }

      // Permanent failure or exhausted retries
      console.error(
        `[worker] Job ${jobId} failed permanently: ${errorMessage}`
      );

      try {
        await db
          .update(jobs)
          .set({
            status: "failed",
            error: errorMessage,
            finishedAt: new Date(),
          })
          .where(eq(jobs.id, jobId))
          .run();
      } catch {
        console.error(`[worker] Failed to mark job ${jobId} as failed in DB`);
      }

      // Clean up partial files
      cleanupPartialFiles();

      // Still check batch completion in case other jobs are done
      try {
        await checkBatchCompletion(batchId);
      } catch {
        console.error(
          `[worker] Failed to check batch completion for ${batchId}`
        );
      }

      return; // Exit retry loop
    }
  }
}

/**
 * Clean up partial/temp files left behind by a failed or retried job.
 * Removes .part and .ytdl files in the downloads directory.
 */
function cleanupPartialFiles(): void {
  try {
    const tempExtensions = [".part", ".ytdl", ".temp"];
    const downloadsDir = DOWNLOADS_ROOT;

    if (!fs.existsSync(downloadsDir)) return;

    const cleanupDir = (dir: string): void => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          cleanupDir(fullPath);
          // Remove empty directories
          try {
            const remaining = fs.readdirSync(fullPath);
            if (remaining.length === 0) {
              fs.rmdirSync(fullPath);
            }
          } catch {
            // ignore
          }
        } else if (
          tempExtensions.some((ext) => entry.name.endsWith(ext))
        ) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`[worker] Cleaned up temp file: ${fullPath}`);
          } catch {
            // ignore — file might be in use
          }
        }
      }
    };

    cleanupDir(downloadsDir);
  } catch (err) {
    console.warn("[worker] Temp file cleanup encountered an error:", err);
  }
}

/**
 * Startup sweep: clean orphaned temp files from the downloads directory.
 * Called once on worker startup after crash recovery.
 */
export function startupCleanup(): void {
  console.log("[worker] Running startup temp file cleanup...");
  cleanupPartialFiles();
  console.log("[worker] Startup cleanup complete");
}

/**
 * Run yt-dlp as a child process, parsing stdout for progress updates.
 * Throttles SQLite progress updates to once per second.
 */
function runYtDlp(args: string[], jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let lastProgressUpdate = 0;

    proc.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");

      for (const line of lines) {
        const pct = parseProgressLine(line);
        if (pct !== null) {
          const now = Date.now();
          if (now - lastProgressUpdate >= 1000) {
            try {
              db.update(jobs)
                .set({ progressPct: pct })
                .where(eq(jobs.id, jobId))
                .run();
            } catch {
              // Non-critical: progress update failure doesn't kill the download
            }
            lastProgressUpdate = now;
          }
        }
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          db.update(jobs)
            .set({ progressPct: 100 })
            .where(eq(jobs.id, jobId))
            .run();
        } catch {
          // Non-critical
        }
        resolve();
      } else {
        const errorMsg = parseYtDlpError(stderr);
        reject(new Error(errorMsg));
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error("yt-dlp is not installed — install it to download videos")
        );
      } else {
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      }
    });
  });
}

/**
 * Parse yt-dlp stderr into a user-friendly error message.
 */
function parseYtDlpError(stderr: string): string {
  if (stderr.includes("Private video") || stderr.includes("Sign in")) {
    return "This video is private or age-restricted — it can't be downloaded";
  }
  if (stderr.includes("HTTP Error 404") || stderr.includes("does not exist")) {
    return "This video was deleted or doesn't exist";
  }
  if (stderr.includes("HTTP Error 429")) {
    return "YouTube is rate-limiting requests — try again later";
  }
  if (stderr.includes("Unable to download")) {
    return "Couldn't reach YouTube — check your connection";
  }
  if (stderr.includes("is not a valid URL")) {
    return "Invalid video URL";
  }
  if (stderr.includes("HTTP Error 5")) {
    return "YouTube server error — try again later";
  }

  const lastLine = stderr.trim().split("\n").pop() || "Unknown error";
  return lastLine.slice(0, 200);
}

/**
 * Check if all jobs in a batch are done and update batch status accordingly.
 */
async function checkBatchCompletion(batchId: string): Promise<void> {
  const batch = await db.query.batches.findFirst({
    where: eq(batches.id, batchId),
  });

  if (!batch || batch.status === "done" || batch.status === "failed") {
    return;
  }

  const batchJobs = await db.query.jobs.findMany({
    where: eq(jobs.batchId, batchId),
  });

  const allDone = batchJobs.every((j) => j.status === "done");
  const anyFailed = batchJobs.some((j) => j.status === "failed");
  const allFinished = batchJobs.every(
    (j) => j.status === "done" || j.status === "failed"
  );

  if (allDone) {
    await db
      .update(batches)
      .set({ status: "done" })
      .where(eq(batches.id, batchId))
      .run();
    console.log(
      `[worker] Batch ${batchId} completed — all ${batchJobs.length} jobs done`
    );
  } else if (allFinished && anyFailed) {
    const doneCount = batchJobs.filter((j) => j.status === "done").length;
    await db
      .update(batches)
      .set({ status: "partial" })
      .where(eq(batches.id, batchId))
      .run();
    console.log(
      `[worker] Batch ${batchId} partially completed — ${doneCount}/${batchJobs.length} succeeded`
    );
  }
}

/**
 * Find the actual output file, since yt-dlp may change the extension.
 * Looks for files matching the base name with various extensions.
 */
function findOutputFile(dir: string, title: string): string | null {
  const sanitized = sanitizeFilename(title);

  const extensions = ["mp4", "mkv", "webm", "mp3", "m4a", "opus", "ogg"];
  for (const ext of extensions) {
    const candidate = path.join(dir, `${sanitized}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const files = fs.readdirSync(dir);
    const match = files.find((f) => f.startsWith(sanitized));
    if (match) return path.join(dir, match);
  } catch {
    // ignore
  }

  return null;
}

/**
 * Helper to download an image/file from a URL and save it to a destination path.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.promises.writeFile(destPath, buffer);
}

/**
 * Helper to get extension from image URLs, default to "jpg".
 */
function getUrlExtension(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const parts = pathname.split(".");
    if (parts.length > 1) {
      const ext = parts.pop()?.toLowerCase();
      if (ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    }
    return "jpg";
  } catch {
    return "jpg";
  }
}
