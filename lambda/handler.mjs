var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// lib/aws/config.ts
var config_exports = {};
__export(config_exports, {
  AWS_RESOURCES: () => AWS_RESOURCES,
  docClient: () => docClient,
  dynamoClient: () => dynamoClient,
  isAwsConfigured: () => isAwsConfigured,
  s3Client: () => s3Client,
  sqsClient: () => sqsClient
});
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
function isAwsConfigured() {
  return !!(process.env.AWS_REGION && process.env.DYNAMODB_JOBS_TABLE && process.env.S3_OUTPUTS_BUCKET);
}
var AWS_REGION, dynamoClient, docClient, s3Client, sqsClient, AWS_RESOURCES;
var init_config = __esm({
  "lib/aws/config.ts"() {
    "use strict";
    AWS_REGION = process.env.AWS_REGION || "us-east-1";
    dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true
      }
    });
    s3Client = new S3Client({ region: AWS_REGION });
    sqsClient = new SQSClient({ region: AWS_REGION });
    AWS_RESOURCES = {
      /** DynamoDB table for download batches */
      BATCHES_TABLE: process.env.DYNAMODB_BATCHES_TABLE || "kymo-batches",
      /** DynamoDB table for individual download jobs */
      JOBS_TABLE: process.env.DYNAMODB_JOBS_TABLE || "kymo-jobs",
      /** DynamoDB table for download history (dedup) */
      DOWNLOAD_HISTORY_TABLE: process.env.DYNAMODB_DOWNLOAD_HISTORY_TABLE || "kymo-download-history",
      /** DynamoDB table for idempotency keys */
      IDEMPOTENCY_TABLE: process.env.DYNAMODB_IDEMPOTENCY_TABLE || "kymo-idempotency",
      /** S3 bucket for download outputs */
      OUTPUTS_BUCKET: process.env.S3_OUTPUTS_BUCKET || "kymo-outputs",
      /** SQS queue for download jobs */
      DOWNLOAD_QUEUE: process.env.SQS_DOWNLOAD_QUEUE || "kymo-downloads",
      /** SQS dead-letter queue */
      DLQ_QUEUE: process.env.SQS_DLQ_QUEUE || "kymo-downloads-dlq"
    };
  }
});

// lambda/worker-handler.ts
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

// lib/db/dynamodb.ts
init_config();
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";
var { BATCHES_TABLE, JOBS_TABLE, DOWNLOAD_HISTORY_TABLE, IDEMPOTENCY_TABLE } = AWS_RESOURCES;
async function updateBatchStatus(id, status, completedJobs) {
  const updateExpression = completedJobs !== void 0 ? "SET #status = :status, completedJobs = :completedJobs" : "SET #status = :status";
  const expressionAttributeNames = { "#status": "status" };
  const expressionAttributeValues = { ":status": status };
  if (completedJobs !== void 0) {
    expressionAttributeValues[":completedJobs"] = completedJobs;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: BATCHES_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    })
  );
}
async function incrementBatchCompletedJobs(id) {
  await docClient.send(
    new UpdateCommand({
      TableName: BATCHES_TABLE,
      Key: { id },
      UpdateExpression: "ADD completedJobs :inc",
      ExpressionAttributeValues: { ":inc": 1 }
    })
  );
}
async function getJob(id) {
  const result = await docClient.send(
    new GetCommand({
      TableName: JOBS_TABLE,
      Key: { id }
    })
  );
  return result.Item || null;
}
async function updateJobStatus(id, status, updates) {
  let updateExpression = "SET #status = :status";
  const expressionAttributeNames = { "#status": "status" };
  const expressionAttributeValues = { ":status": status };
  if (updates?.progressPct !== void 0) {
    updateExpression += ", progressPct = :progressPct";
    expressionAttributeValues[":progressPct"] = updates.progressPct;
  }
  if (updates?.outputPath !== void 0) {
    updateExpression += ", outputPath = :outputPath";
    expressionAttributeValues[":outputPath"] = updates.outputPath;
  }
  if (updates?.s3Key !== void 0) {
    updateExpression += ", s3Key = :s3Key";
    expressionAttributeValues[":s3Key"] = updates.s3Key;
  }
  if (updates?.error !== void 0) {
    updateExpression += ", #err = :error";
    expressionAttributeNames["#err"] = "error";
    expressionAttributeValues[":error"] = updates.error;
  }
  if (updates?.finishedAt !== void 0) {
    updateExpression += ", finishedAt = :finishedAt";
    expressionAttributeValues[":finishedAt"] = updates.finishedAt;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    })
  );
}
async function updateJobProgress(id, progressPct) {
  await docClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { id },
      UpdateExpression: "SET progressPct = :progress",
      ExpressionAttributeValues: { ":progress": progressPct }
    })
  );
}
async function claimJob(id) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { id },
        UpdateExpression: "SET #status = :claimed",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":claimed": "running",
          ":pending": "pending"
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}
async function getJobsByBatch(batchId) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: "batchId-index",
      KeyConditionExpression: "batchId = :batchId",
      ExpressionAttributeValues: { ":batchId": batchId }
    })
  );
  return result.Items || [];
}
async function createDownloadHistory(item) {
  await docClient.send(
    new PutCommand({
      TableName: DOWNLOAD_HISTORY_TABLE,
      Item: {
        ...item,
        expiresAt: Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60
        // 30 days
      }
    })
  );
}

// lib/s3/index.ts
init_config();
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var { OUTPUTS_BUCKET } = AWS_RESOURCES;
function getOutputKey(batchId, jobId, filename) {
  return `outputs/${batchId}/${jobId}/${filename}`;
}

// lib/worker/ytdlp-args.ts
function videoFormatSelector(quality) {
  switch (quality) {
    case "1080p":
      return "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b";
    case "720p":
      return "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b";
    case "480p":
      return "bv*[height<=480]+ba/b[height<=480]/bv*+ba/b";
    case "best":
    default:
      return "bv*+ba/b";
  }
}
function buildYtDlpArgs(job, outputPath) {
  const args = [];
  args.push("--no-warnings", "--newline");
  args.push(
    "--progress-template",
    "download:%(progress._percent_str)s"
  );
  args.push("-c");
  args.push("-o", outputPath);
  if (job.kind === "audio") {
    args.push("--extract-audio");
    args.push("--audio-format", job.quality || "mp3");
    args.push("--audio-quality", "0");
  } else {
    args.push("-f", videoFormatSelector(job.quality));
  }
  if (job.includeThumbnail) {
    args.push("--write-thumbnail");
    args.push("--convert-thumbnails", "jpg");
  }
  if (job.includeMetadata) {
    args.push("--write-info-json");
  }
  return args;
}

// lib/worker/progress.ts
function parseProgressLine(line) {
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
var RESERVED_NAMES = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
  "CLOCK$"
]);
function sanitizeFilename(name) {
  let result = name.replace(/[\x00-\x1F\x7F]/g, "").replace(/[\u200B-\u200F\uFEFF]/g, "").replace(/[\/\\:*?"<>|]/g, "_").replace(/_{2,}/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").trim().slice(0, 200);
  if (!result) {
    result = "untitled";
  }
  const baseName = result.split(".")[0]?.toUpperCase();
  if (baseName && RESERVED_NAMES.has(baseName)) {
    result = `_${result}`;
  }
  return result;
}
var RETRYABLE_PATTERNS = [
  /HTTP Error 5\d{2}/,
  // 5xx server errors
  /HTTP Error 429/,
  // rate limit
  /timed?\s*out/i,
  // timeout
  /ECONNRESET/i,
  // connection reset
  /ECONNREFUSED/i,
  // connection refused
  /ETIMEDOUT/i,
  // connection timeout
  /ENOTFOUND/i,
  // DNS failure
  /socket hang up/i,
  // socket hang up
  /temporary failure/i,
  // temporary DNS failure
  /network is unreachable/i,
  // network unreachable
  /connection reset by peer/i,
  // reset by peer
  /Unable to download/i
  // generic network failure
];
var PERMANENT_ERROR_PATTERNS = [
  /Private video/i,
  /Sign in/i,
  /HTTP Error 404/,
  /does not exist/i,
  /is not a valid URL/i,
  /This video is unavailable/i,
  /This video has been removed/i,
  /Video unavailable/i,
  /This channel does not exist/i
];
function isRetryableError(errorMessage) {
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) return false;
  }
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(errorMessage)) return true;
  }
  return false;
}

// lambda/worker-handler.ts
var DOWNLOADS_ROOT = "/tmp/kymo";
var MAX_RETRIES = 2;
var RETRY_BASE_DELAY_MS = 5e3;
var PROGRESS_THROTTLE_MS = 3e3;
var handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const { jobId } = message;
      if (!jobId) {
        console.error("[Lambda] No jobId in message:", record.body);
        continue;
      }
      console.log(`[Lambda] Processing job ${jobId}`);
      await processJobLambda(jobId);
      console.log(`[Lambda] Job ${jobId} completed successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Lambda] Failed to process job:`, errorMessage);
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }
  return { batchItemFailures };
};
async function processJobLambda(jobId) {
  const claimed = await claimJob(jobId);
  if (!claimed) {
    console.log(`[Lambda] Job ${jobId} already claimed by another worker \u2014 skipping`);
    return;
  }
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found in DynamoDB`);
  }
  if (!job.batchId || !job.videoId) {
    throw new Error(`Job ${jobId} is missing batchId or videoId`);
  }
  await downloadWithRetryLambda(jobId, job.batchId, job.videoId);
}
async function downloadWithRetryLambda(jobId, batchId, videoId) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.log(`[Lambda] Retrying job ${jobId} (attempt ${attempt + 1}) after ${delay}ms`);
      await sleep(delay);
      await updateJobProgress(jobId, 0);
    }
    try {
      const job = await getJob(jobId);
      if (!job) throw new Error("Job not found");
      if (job.kind === "image") {
        await processImageJob(job);
        return;
      }
      const outputDir = path.join(DOWNLOADS_ROOT, sanitizeFilename(job.id));
      fs.mkdirSync(outputDir, { recursive: true });
      const outputTemplate = path.join(outputDir, "output");
      const args = buildYtDlpArgs(
        {
          kind: job.kind,
          quality: job.quality,
          includeThumbnail: job.includeThumbnail,
          includeMetadata: job.includeMetadata
        },
        outputTemplate
      );
      args.push(`https://www.youtube.com/watch?v=${videoId}`);
      console.log(`[Lambda] Processing job ${job.id}: yt-dlp started`);
      await runYtDlpLambda(args, jobId);
      const actualOutput = findOutputFile(outputDir);
      const s3Key = getOutputKey(batchId, jobId, path.basename(actualOutput || outputTemplate));
      if (actualOutput) {
        await uploadToS3(actualOutput, s3Key);
      }
      const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      await updateJobStatus(jobId, "done", {
        progressPct: 100,
        outputPath: actualOutput || outputTemplate,
        s3Key,
        finishedAt
      });
      await createDownloadHistory({
        videoId,
        kind: job.kind,
        downloadedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      await incrementBatchCompletedJobs(batchId);
      await checkBatchCompletionLambda(batchId);
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
      console.error(`[Lambda] Job ${jobId} failed permanently: ${errorMessage}`);
      await updateJobStatus(jobId, "failed", {
        error: errorMessage,
        finishedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      await checkBatchCompletionLambda(batchId);
      return;
    }
  }
}
async function processImageJob(job) {
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
    finishedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await incrementBatchCompletedJobs(job.batchId);
  await checkBatchCompletionLambda(job.batchId);
  cleanupDir(outputDir);
}
function runYtDlpLambda(args, jobId) {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `/opt/bin:${process.env.PATH || "/usr/local/bin:/usr/bin:/bin"}`
      }
    });
    let stderr = "";
    let lastProgressUpdate = 0;
    proc.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const pct = parseProgressLine(line);
        if (pct !== null) {
          const now = Date.now();
          if (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS) {
            updateJobProgress(jobId, pct).catch(() => {
            });
            lastProgressUpdate = now;
          }
        }
      }
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        updateJobProgress(jobId, 100).catch(() => {
        });
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
async function checkBatchCompletionLambda(batchId) {
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
async function uploadToS3(localPath, s3Key) {
  const { s3Client: s3Client2, AWS_RESOURCES: AWS_RESOURCES2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  const { PutObjectCommand: PutObjectCommand2 } = await import("@aws-sdk/client-s3");
  const fs2 = await import("fs");
  const fileStream = fs2.createReadStream(localPath);
  await s3Client2.send(
    new PutObjectCommand2({
      Bucket: AWS_RESOURCES2.OUTPUTS_BUCKET,
      Key: s3Key,
      Body: fileStream
    })
  );
}
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}
function findOutputFile(dir) {
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
function cleanupDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
  }
}
function getUrlExtension(url) {
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
function parseYtDlpError(stderr) {
  if (stderr.includes("Private video") || stderr.includes("Sign in")) {
    return "This video is private or age-restricted";
  }
  if (stderr.includes("HTTP Error 404") || stderr.includes("does not exist")) {
    return "This video was deleted or doesn't exist";
  }
  if (stderr.includes("HTTP Error 429")) {
    return "YouTube is rate-limiting requests \u2014 try again later";
  }
  if (stderr.includes("is not a valid URL")) {
    return "Invalid video URL";
  }
  const lastLine = stderr.trim().split("\n").pop() || "Unknown error";
  return lastLine.slice(0, 200);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  handler
};
