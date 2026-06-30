/**
 * Abstract data access layer.
 *
 * Provides a unified interface for database operations that works with
 * both SQLite (local development) and DynamoDB (production AWS).
 *
 * The active backend is determined by the USE_DYNAMODB environment variable.
 * When true, all operations go through DynamoDB. When false or unset,
 * operations use the existing SQLite/Drizzle setup.
 */

import * as dynamo from "./dynamodb";
import { isAwsConfigured } from "../aws/config";

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Check if we should use DynamoDB for this operation.
 * Returns true if USE_DYNAMODB=1 AND AWS is properly configured.
 */
export function useDynamoDb(): boolean {
  return process.env.USE_DYNAMODB === "1" && isAwsConfigured();
}

// ─── Types (re-export from DynamoDB for consistency) ────────────────────────

export type { BatchItem, JobItem, DownloadHistoryItem, BatchStatus, JobStatus } from "./dynamodb";

// ─── Batch Operations ───────────────────────────────────────────────────────

export async function createBatch(batch: dynamo.BatchItem): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.createBatch(batch);
  }
  // SQLite path: batch creation is handled by the existing route handler
  // This is called from the API layer which already has SQLite logic
  throw new Error("SQLite batch creation not implemented in repository - use direct SQLite operations");
}

export async function getBatch(id: string): Promise<dynamo.BatchItem | null> {
  if (useDynamoDb()) {
    return dynamo.getBatch(id);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { batches } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  
  const result = await db.query.batches.findFirst({
    where: eq(batches.id, id),
  });
  
  if (!result) return null;
  
  return {
    id: result.id,
    status: result.status as dynamo.BatchStatus,
    totalJobs: result.totalJobs,
    completedJobs: result.completedJobs,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function updateBatchStatus(
  id: string,
  status: dynamo.BatchStatus,
  completedJobs?: number
): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.updateBatchStatus(id, status, completedJobs);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { batches } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  
  if (completedJobs !== undefined) {
    await db.update(batches).set({ status, completedJobs }).where(eq(batches.id, id)).run();
  } else {
    await db.update(batches).set({ status }).where(eq(batches.id, id)).run();
  }
}

export async function incrementBatchCompletedJobs(id: string): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.incrementBatchCompletedJobs(id);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { batches } = await import("./schema");
  const { eq, sql } = await import("drizzle-orm");
  
  await db
    .update(batches)
    .set({ completedJobs: sql`${batches.completedJobs} + 1` })
    .where(eq(batches.id, id))
    .run();
}

// ─── Job Operations ─────────────────────────────────────────────────────────

export async function createJob(job: dynamo.JobItem): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.createJob(job);
  }
  // SQLite path: job creation is handled by the existing route handler
  throw new Error("SQLite job creation not implemented in repository - use direct SQLite operations");
}

export async function getJob(id: string): Promise<dynamo.JobItem | null> {
  if (useDynamoDb()) {
    return dynamo.getJob(id);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { jobs } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  
  const result = await db.query.jobs.findFirst({
    where: eq(jobs.id, id),
  });
  
  if (!result) return null;
  
  return {
    id: result.id,
    batchId: result.batchId || "",
    videoId: result.videoId,
    kind: result.kind as "video" | "audio" | "image",
    quality: result.quality,
    includeThumbnail: result.includeThumbnail,
    includeMetadata: result.includeMetadata,
    status: result.status as dynamo.JobStatus,
    progressPct: result.progressPct || 0,
    outputPath: result.outputPath,
    s3Key: null,
    error: result.error,
    createdAt: result.createdAt.toISOString(),
    finishedAt: result.finishedAt ? result.finishedAt.toISOString() : null,
  };
}

export async function updateJobStatus(
  id: string,
  status: dynamo.JobStatus,
  updates?: Partial<Pick<dynamo.JobItem, "progressPct" | "outputPath" | "s3Key" | "error" | "finishedAt">>
): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.updateJobStatus(id, status, updates);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { jobs } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  
  const updateData: Record<string, unknown> = { status };
  if (updates?.progressPct !== undefined) updateData.progressPct = updates.progressPct;
  if (updates?.outputPath !== undefined) updateData.outputPath = updates.outputPath;
  if (updates?.error !== undefined) updateData.error = updates.error;
  if (updates?.finishedAt !== undefined && updates.finishedAt !== null) {
    updateData.finishedAt = new Date(updates.finishedAt);
  }
  
  await db.update(jobs).set(updateData).where(eq(jobs.id, id)).run();
}

export async function updateJobProgress(id: string, progressPct: number): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.updateJobProgress(id, progressPct);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { jobs } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  
  await db.update(jobs).set({ progressPct }).where(eq(jobs.id, id)).run();
}

export async function claimJob(id: string): Promise<boolean> {
  if (useDynamoDb()) {
    return dynamo.claimJob(id);
  }
  // SQLite fallback: mark as running
  const { db } = await import("./index");
  const { jobs } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  
  try {
    const result = await db
      .update(jobs)
      .set({ status: "running", progressPct: 0 })
      .where(and(eq(jobs.id, id), eq(jobs.status, "pending")))
      .run();
    
    return result.changes > 0;
  } catch {
    return false;
  }
}

export async function getJobsByBatch(batchId: string): Promise<dynamo.JobItem[]> {
  if (useDynamoDb()) {
    return dynamo.getJobsByBatch(batchId);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { jobs } = await import("./schema");
  const { eq } = await import("drizzle-orm");
  
  const results = await db.query.jobs.findMany({
    where: eq(jobs.batchId, batchId),
  });
  
  return results.map((r) => ({
    id: r.id,
    batchId: r.batchId || "",
    videoId: r.videoId,
    kind: r.kind as "video" | "audio" | "image",
    quality: r.quality,
    includeThumbnail: r.includeThumbnail,
    includeMetadata: r.includeMetadata,
    status: r.status as dynamo.JobStatus,
    progressPct: r.progressPct || 0,
    outputPath: r.outputPath,
    s3Key: null,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() || null,
  }));
}

// ─── Download History Operations ────────────────────────────────────────────

export async function hasBeenDownloaded(videoId: string, kind: string): Promise<boolean> {
  if (useDynamoDb()) {
    return dynamo.getDownloadHistory(videoId, kind);
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { downloadHistory } = await import("./schema");
  const { eq, and } = await import("drizzle-orm");
  
  const result = await db.query.downloadHistory.findFirst({
    where: and(
      eq(downloadHistory.videoId, videoId),
      eq(downloadHistory.kind, kind)
    ),
  });
  
  return !!result;
}

export async function recordDownload(videoId: string, kind: string): Promise<void> {
  if (useDynamoDb()) {
    return dynamo.createDownloadHistory({
      videoId,
      kind,
      downloadedAt: new Date().toISOString(),
    });
  }
  // SQLite fallback
  const { db } = await import("./index");
  const { downloadHistory } = await import("./schema");
  
  try {
    await db
      .insert(downloadHistory)
      .values({
        videoId,
        kind,
        downloadedAt: new Date(),
      })
      .run();
  } catch {
    // Non-critical: download succeeded even if history insert fails
  }
}
