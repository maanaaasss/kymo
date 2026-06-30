/**
 * Lambda worker handler for processing download jobs.
 *
 * This is the entry point for Lambda invocations triggered by SQS.
 * Each invocation processes a single job: download via yt-dlp,
 * upload to S3, and update job status in DynamoDB.
 *
 * Key design principles:
 * - Stateless: All job state is in DynamoDB
 * - Disposable: Lambda process can be killed safely
 * - Time-bounded: Must complete within Lambda timeout
 */

import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import {
  getJob,
  updateJobStatus,
  updateJobProgress,
  claimJob,
  incrementBatchCompletedJobs,
  getJobsByBatch,
  updateBatchStatus,
  createDownloadHistory,
} from "../lib/db/dynamodb";
import { uploadJobOutputs, getOutputKey } from "../lib/s3";
import { buildYtDlpArgs } from "../lib/worker/ytdlp-args";
import { parseProgressLine, sanitizeFilename, isRetryableError } from "../lib/worker/progress";

const DOWNLOADS_ROOT = "/tmp/kymo";
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 5_000;
const PROGRESS_THROTTLE_MS = 3_000; // Throttle DynamoDB writes to 3 seconds

/**
 * Main Lambda handler invoked by SQS.
 * Processes one job per invocation.
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const { jobId } = message;

      if (!jobId) {
        console.error("[Lambda] No jobId in message:", record.body);
        continue; // Skip malformed messages
      }

      console.log(`[Lambda] Processing job ${jobId}`);
      await processJobLambda(jobId);
      console.log(`[Lambda] Job ${jobId} completed successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Lambda] Failed to process job:`, errorMessage);

      // Add to batch failures for SQS retry
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return { batchItemFailures };
};

/**
 * Process a single download job in Lambda context.
 */
async function processJobLambda(jobId: string): Promise<void> {
  // 1. Claim the job (atomic update to prevent duplicate processing)
  const claimed = await claimJob(jobId);
  if (!claimed) {
    console.log(`[Lambda] Job ${jobId} already claimed by another worker — skipping`);
    return;
  }

  // 2. Fetch job details
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found in DynamoDB`);
  }

  if (!job.batchId || !job.videoId) {
    throw new Error(`Job ${jobId} is missing batchId or videoId`);
  }

  // 3. Process with retry logic
  await downloadWithRetryLambda(jobId, job.batchId, job.videoId);
}

/**
 * Download with automatic retry for transient errors.
 */
async function downloadWithRetryLambda(
  jobId: string,
  batchId: string,
  videoId: string
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Lambda] Retrying job ${jobId} (attempt ${attempt + 1}) after ${delay}ms`);
      await sleep(delay);

      // Reset progress for retry
      await updateJobProgress(jobId, 0);
    }

    try {
      const job = await getJob(jobId);
      if (!job) throw new Error("Job not found");

      if (job.kind === "image") {
        await processImageJob(job);
        return;
      }

      // Build yt-dlp arguments
  const outputDir = path.join(DOWNLOADS_ROOT, sanitizeFilename(job.id));
      fs.mkdirSync(outputDir, { recursive: true });

      const outputTemplate = path.join(outputDir, "output");

      const args = buildYtDlpArgs(
        {
          kind: job.kind,
          quality: job.quality,
          includeThumbnail: job.includeThumbnail,
          includeMetadata: job.includeMetadata,
        },
        outputTemplate
      );

      // Add the YouTube URL
      args.push(`https://www.youtube.com/watch?v=${videoId}`);

      console.log(`[Lambda] Processing job ${job.id}: yt-dlp started`);

      // Run yt-dlp
      await runYtDlpLambda(args, jobId);

      // Find the output file
      const actualOutput = findOutputFile(outputDir);

      // Upload to S3
      const s3Key = getOutputKey(batchId, jobId, path.basename(actualOutput || outputTemplate));
      
      if (actualOutput) {
        await uploadToS3(actualOutput, s3Key);
      }

      // Update job status
      const finishedAt = new Date().toISOString();
      await updateJobStatus(jobId, "done", {
        progressPct: 100,
        outputPath: actualOutput || outputTemplate,
        s3Key,
        finishedAt,
      });

      // Record download history
      await createDownloadHistory({
        videoId,
        kind: job.kind,
        downloadedAt: new Date().toISOString(),
      });

      // Increment batch completed jobs
      await incrementBatchCompletedJobs(batchId);

      // Check batch completion
      await checkBatchCompletionLambda(batchId);

      // Cleanup temp files
      cleanupDir(outputDir);

      console.log(`[Lambda] Job ${jobId} completed`);
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      if (isRetryableError(errorMessage) && attempt < MAX_RETRIES) {
        console.warn(`[Lambda] Job ${jobId} failed with retryable error: ${errorMessage}`);
        cleanupDir(path.join(DOWNLOADS_ROOT, sanitizeFilename(jobId)));
        continue;
      }

      // Permanent failure
      console.error(`[Lambda] Job ${jobId} failed permanently: ${errorMessage}`);
      await updateJobStatus(jobId, "failed", {
        error: errorMessage,
        finishedAt: new Date().toISOString(),
      });

      await checkBatchCompletionLambda(batchId);
      return;
    }
  }
}

/**
 * Process an image download job.
 */
async function processImageJob(job: Awaited<ReturnType<typeof getJob>>): Promise<void> {
  if (!job || !job.batchId) throw new Error("Invalid job");

  const meta = JSON.parse(job.quality || "{}");
  const imageUrl = meta.url;
  const imageType = meta.type || "avatar";
  const channelTitle = meta.channelTitle || "Unknown Channel";

  const outputDir = path.join(DOWNLOADS_ROOT, sanitizeFilename(job.id));
  fs.mkdirSync(outputDir, { recursive: true });

  const ext = getUrlExtension(imageUrl);
  const filename = `${sanitizeFilename(channelTitle)}_${imageType}.${ext}`;
  const localPath = path.join(outputDir, filename);

  await downloadFile(imageUrl, localPath);

  const s3Key = getOutputKey(job.batchId, job.id, filename);
  await uploadToS3(localPath, s3Key);

  await updateJobStatus(job.id, "done", {
    progressPct: 100,
    outputPath: localPath,
    s3Key,
    finishedAt: new Date().toISOString(),
  });

  await incrementBatchCompletedJobs(job.batchId);
  await checkBatchCompletionLambda(job.batchId);
  cleanupDir(outputDir);
}

/**
 * Run yt-dlp with progress tracking in Lambda.
 */
function runYtDlpLambda(args: string[], jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `/opt/bin:${process.env.PATH || "/usr/local/bin:/usr/bin:/bin"}`,
      },
    });

    let stderr = "";
    let lastProgressUpdate = 0;

    proc.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");

      for (const line of lines) {
        const pct = parseProgressLine(line);
        if (pct !== null) {
          const now = Date.now();
          if (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS) {
            updateJobProgress(jobId, pct).catch(() => {});
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
        updateJobProgress(jobId, 100).catch(() => {});
        resolve();
      } else {
        reject(new Error(parseYtDlpError(stderr)));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Check if all jobs in a batch are done.
 */
async function checkBatchCompletionLambda(batchId: string): Promise<void> {
  const batchJobs = await getJobsByBatch(batchId);

  const allDone = batchJobs.every((j) => j.status === "done");
  const anyFailed = batchJobs.some((j) => j.status === "failed");
  const allFinished = batchJobs.every(
    (j) => j.status === "done" || j.status === "failed"
  );

  if (allDone) {
    await updateBatchStatus(batchId, "done", batchJobs.length);
    console.log(`[Lambda] Batch ${batchId} completed`);
  } else if (allFinished && anyFailed) {
    const doneCount = batchJobs.filter((j) => j.status === "done").length;
    await updateBatchStatus(batchId, "partial", doneCount);
    console.log(`[Lambda] Batch ${batchId} partially completed`);
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

async function uploadToS3(localPath: string, s3Key: string): Promise<void> {
  const { s3Client, AWS_RESOURCES } = await import("../lib/aws/config");
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const fs = await import("fs");

  const fileStream = fs.createReadStream(localPath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: AWS_RESOURCES.OUTPUTS_BUCKET,
      Key: s3Key,
      Body: fileStream,
    })
  );
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}

function findOutputFile(dir: string): string | null {
  try {
    const files = fs.readdirSync(dir);
    const extensions = ["mp4", "mkv", "webm", "mp3", "m4a", "opus", "ogg"];
    for (const ext of extensions) {
      const match = files.find((f) => f.endsWith(`.${ext}`));
      if (match) return path.join(dir, match);
    }
    return files.length > 0 ? path.join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

function cleanupDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Non-critical
  }
}

function getUrlExtension(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split(".");
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

function parseYtDlpError(stderr: string): string {
  if (stderr.includes("Private video") || stderr.includes("Sign in")) {
    return "This video is private or age-restricted";
  }
  if (stderr.includes("HTTP Error 404") || stderr.includes("does not exist")) {
    return "This video was deleted or doesn't exist";
  }
  if (stderr.includes("HTTP Error 429")) {
    return "YouTube is rate-limiting requests — try again later";
  }
  if (stderr.includes("is not a valid URL")) {
    return "Invalid video URL";
  }
  const lastLine = stderr.trim().split("\n").pop() || "Unknown error";
  return lastLine.slice(0, 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
