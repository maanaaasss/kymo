/**
 * DynamoDB operations for job state management.
 *
 * Provides CRUD operations for batches, jobs, and download history
 * using the AWS DynamoDB Document Client.
 */

import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, AWS_RESOURCES } from "../aws/config";

const { BATCHES_TABLE, JOBS_TABLE, DOWNLOAD_HISTORY_TABLE, IDEMPOTENCY_TABLE } = AWS_RESOURCES;

// ─── Types ──────────────────────────────────────────────────────────────────

export type BatchStatus = "pending" | "running" | "done" | "failed" | "partial";
export type JobStatus = "pending" | "running" | "done" | "failed";

export interface BatchItem {
  id: string;
  status: BatchStatus;
  totalJobs: number;
  completedJobs: number;
  createdAt: string; // ISO string
  /** TTL for automatic cleanup (Unix timestamp in seconds) */
  expiresAt?: number;
}

export interface JobItem {
  id: string;
  batchId: string;
  videoId: string | null;
  kind: "video" | "audio" | "image";
  quality: string | null;
  includeThumbnail: boolean;
  includeMetadata: boolean;
  status: JobStatus;
  progressPct: number;
  outputPath: string | null;
  s3Key: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** TTL for automatic cleanup (Unix timestamp in seconds) */
  expiresAt?: number;
}

export interface DownloadHistoryItem {
  videoId: string;
  kind: string;
  downloadedAt: string;
}

export interface IdempotencyItem {
  key: string;
  jobId: string;
  batchId: string;
  createdAt: string;
  /** TTL for automatic cleanup (Unix timestamp in seconds) */
  expiresAt: number;
}

// ─── Batch Operations ───────────────────────────────────────────────────────

export async function createBatch(batch: BatchItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: BATCHES_TABLE,
      Item: {
        ...batch,
        expiresAt: batch.expiresAt || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
    })
  );
}

export async function getBatch(id: string): Promise<BatchItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: BATCHES_TABLE,
      Key: { id },
    })
  );
  return (result.Item as BatchItem) || null;
}

export async function updateBatchStatus(
  id: string,
  status: BatchStatus,
  completedJobs?: number
): Promise<void> {
  const updateExpression = completedJobs !== undefined
    ? "SET #status = :status, completedJobs = :completedJobs"
    : "SET #status = :status";
  
  const expressionAttributeNames = { "#status": "status" };
  const expressionAttributeValues: Record<string, unknown> = { ":status": status };
  
  if (completedJobs !== undefined) {
    expressionAttributeValues[":completedJobs"] = completedJobs;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: BATCHES_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

export async function incrementBatchCompletedJobs(id: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: BATCHES_TABLE,
      Key: { id },
      UpdateExpression: "ADD completedJobs :inc",
      ExpressionAttributeValues: { ":inc": 1 },
    })
  );
}

export async function getActiveBatches(): Promise<BatchItem[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: BATCHES_TABLE,
      FilterExpression: "#status IN (:pending, :running)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":running": "running",
      },
    })
  );
  return (result.Items as BatchItem[]) || [];
}

// ─── Job Operations ─────────────────────────────────────────────────────────

export async function createJob(job: JobItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: JOBS_TABLE,
      Item: {
        ...job,
        expiresAt: job.expiresAt || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
    })
  );
}

export async function getJob(id: string): Promise<JobItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: JOBS_TABLE,
      Key: { id },
    })
  );
  return (result.Item as JobItem) || null;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  updates?: Partial<Pick<JobItem, "progressPct" | "outputPath" | "s3Key" | "error" | "finishedAt">>
): Promise<void> {
  let updateExpression = "SET #status = :status";
  const expressionAttributeNames: Record<string, string> = { "#status": "status" };
  const expressionAttributeValues: Record<string, unknown> = { ":status": status };

  if (updates?.progressPct !== undefined) {
    updateExpression += ", progressPct = :progressPct";
    expressionAttributeValues[":progressPct"] = updates.progressPct;
  }
  if (updates?.outputPath !== undefined) {
    updateExpression += ", outputPath = :outputPath";
    expressionAttributeValues[":outputPath"] = updates.outputPath;
  }
  if (updates?.s3Key !== undefined) {
    updateExpression += ", s3Key = :s3Key";
    expressionAttributeValues[":s3Key"] = updates.s3Key;
  }
  if (updates?.error !== undefined) {
    updateExpression += ", #err = :error";
    expressionAttributeNames["#err"] = "error";
    expressionAttributeValues[":error"] = updates.error;
  }
  if (updates?.finishedAt !== undefined) {
    updateExpression += ", finishedAt = :finishedAt";
    expressionAttributeValues[":finishedAt"] = updates.finishedAt;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

export async function updateJobProgress(id: string, progressPct: number): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { id },
      UpdateExpression: "SET progressPct = :progress",
      ExpressionAttributeValues: { ":progress": progressPct },
    })
  );
}

export async function claimJob(id: string): Promise<boolean> {
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
          ":pending": "pending",
        },
      })
    );
    return true;
  } catch {
    return false; // Job already claimed by another worker
  }
}

export async function getJobsByBatch(batchId: string): Promise<JobItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: "batchId-index",
      KeyConditionExpression: "batchId = :batchId",
      ExpressionAttributeValues: { ":batchId": batchId },
    })
  );
  return (result.Items as JobItem[]) || [];
}

export async function getPendingJobs(): Promise<JobItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: "status-index",
      KeyConditionExpression: "#status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "pending" },
    })
  );
  return (result.Items as JobItem[]) || [];
}

// ─── Download History Operations ────────────────────────────────────────────

export async function getDownloadHistory(videoId: string, kind: string): Promise<boolean> {
  const result = await docClient.send(
    new GetCommand({
      TableName: DOWNLOAD_HISTORY_TABLE,
      Key: { videoId, kind },
    })
  );
  return !!result.Item;
}

export async function createDownloadHistory(item: DownloadHistoryItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: DOWNLOAD_HISTORY_TABLE,
      Item: {
        ...item,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
      },
    })
  );
}

export async function batchGetDownloadHistory(videoIds: string[], kind: string): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  // DynamoDB BatchGetItem has limit of 100 keys
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 25) {
    chunks.push(videoIds.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    // For simplicity, query one by one (could optimize with BatchGetItem)
    for (const videoId of chunk) {
      const exists = await getDownloadHistory(videoId, kind);
      result.set(videoId, exists);
    }
  }

  return result;
}

// ─── Idempotency Operations ─────────────────────────────────────────────────

export async function checkIdempotency(key: string): Promise<IdempotencyItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IDEMPOTENCY_TABLE,
      Key: { key },
    })
  );
  return (result.Item as IdempotencyItem) || null;
}

export async function createIdempotencyKey(
  key: string,
  jobId: string,
  batchId: string
): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: IDEMPOTENCY_TABLE,
        Item: {
          key,
          jobId,
          batchId,
          createdAt: new Date().toISOString(),
          expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        },
        ConditionExpression: "attribute_not_exists(#key)",
        ExpressionAttributeNames: { "#key": "key" },
      })
    );
    return true;
  } catch {
    return false; // Key already exists
  }
}
