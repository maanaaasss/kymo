/**
 * S3 operations for file storage and pre-signed URL generation.
 *
 * Handles uploading download outputs, thumbnails, and metadata to S3,
 * and generating short-lived pre-signed URLs for secure downloads.
 */

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, AWS_RESOURCES } from "../aws/config";
import fs from "fs";
import path from "path";

const { OUTPUTS_BUCKET } = AWS_RESOURCES;

/** Default pre-signed URL expiry: 1 hour */
const DEFAULT_URL_EXPIRY_SECONDS = 3600;

/** Short-lived URL for immediate downloads */
const SHORT_URL_EXPIRY_SECONDS = 900; // 15 minutes

// ─── S3 Key Helpers ─────────────────────────────────────────────────────────

/**
 * Generate a stable S3 key for a job output.
 * Format: outputs/{batchId}/{jobId}/{filename}
 */
export function getOutputKey(
  batchId: string,
  jobId: string,
  filename: string
): string {
  return `outputs/${batchId}/${jobId}/${filename}`;
}

/**
 * Generate an S3 key for temporary/partial files.
 * Format: tmp/{jobId}/{filename}
 */
export function getTmpKey(jobId: string, filename: string): string {
  return `tmp/${jobId}/${filename}`;
}

/**
 * Generate an S3 key for channel metadata assets.
 * Format: channels/{channelId}/{assetType}.{ext}
 */
export function getChannelAssetKey(
  channelId: string,
  assetType: "profile" | "banner",
  ext: string
): string {
  return `channels/${channelId}/${assetType}.${ext}`;
}

// ─── Upload Operations ──────────────────────────────────────────────────────

/**
 * Upload a file from the local filesystem to S3.
 */
export async function uploadFileToS3(
  localPath: string,
  s3Key: string,
  contentType?: string
): Promise<void> {
  const fileStream = fs.createReadStream(localPath);
  
  await s3Client.send(
    new PutObjectCommand({
      Bucket: OUTPUTS_BUCKET,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType || getContentType(localPath),
    })
  );
}

/**
 * Upload a buffer to S3.
 */
export async function uploadBufferToS3(
  buffer: Buffer,
  s3Key: string,
  contentType: string
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: OUTPUTS_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

/**
 * Upload JSON metadata to S3.
 */
export async function uploadJsonToS3(
  data: unknown,
  s3Key: string
): Promise<void> {
  const jsonString = JSON.stringify(data, null, 2);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: OUTPUTS_BUCKET,
      Key: s3Key,
      Body: jsonString,
      ContentType: "application/json",
    })
  );
}

// ─── Pre-signed URL Operations ──────────────────────────────────────────────

/**
 * Generate a pre-signed URL for downloading a file from S3.
 * Used for secure, time-limited download links.
 */
export async function getPresignedDownloadUrl(
  s3Key: string,
  expirySeconds: number = DEFAULT_URL_EXPIRY_SECONDS,
  filename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: OUTPUTS_BUCKET,
    Key: s3Key,
    ...(filename && {
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
  });

  return getSignedUrl(s3Client, command, { expiresIn: expirySeconds });
}

/**
 * Generate a short-lived pre-signed URL for immediate download.
 */
export async function getShortLivedUrl(
  s3Key: string,
  filename?: string
): Promise<string> {
  return getPresignedDownloadUrl(s3Key, SHORT_URL_EXPIRY_SECONDS, filename);
}

// ─── File Operations ────────────────────────────────────────────────────────

/**
 * Check if a file exists in S3.
 */
export async function fileExistsInS3(s3Key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: OUTPUTS_BUCKET,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file from S3.
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: OUTPUTS_BUCKET,
      Key: s3Key,
    })
  );
}

// ─── Batch Upload for Job Completion ────────────────────────────────────────

export interface JobOutputFiles {
  /** Main output file (video, audio, or image) */
  mainFile?: { localPath: string; filename: string };
  /** Thumbnail file */
  thumbnail?: { localPath: string; filename: string };
  /** Metadata JSON file */
  metadata?: { localPath: string; filename: string };
}

/**
 * Upload all output files for a completed job to S3.
 * Returns the S3 keys for each uploaded file.
 */
export async function uploadJobOutputs(
  batchId: string,
  jobId: string,
  files: JobOutputFiles
): Promise<{ mainKey?: string; thumbnailKey?: string; metadataKey?: string }> {
  const result: { mainKey?: string; thumbnailKey?: string; metadataKey?: string } = {};

  if (files.mainFile) {
    const key = getOutputKey(batchId, jobId, files.mainFile.filename);
    await uploadFileToS3(files.mainFile.localPath, key);
    result.mainKey = key;
  }

  if (files.thumbnail) {
    const key = getOutputKey(batchId, jobId, files.thumbnail.filename);
    await uploadFileToS3(files.thumbnail.localPath, key);
    result.thumbnailKey = key;
  }

  if (files.metadata) {
    const key = getOutputKey(batchId, jobId, files.metadata.filename);
    await uploadFileToS3(files.metadata.localPath, key);
    result.metadataKey = key;
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".opus": "audio/opus",
    ".ogg": "audio/ogg",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".json": "application/json",
  };
  return contentTypes[ext] || "application/octet-stream";
}
