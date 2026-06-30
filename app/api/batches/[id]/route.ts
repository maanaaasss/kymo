import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";
import { useDynamoDb } from "@/lib/db/repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  try {
    const { id } = await params;

    if (useDynamoDb()) {
      return await getBatchDynamoDB(id);
    } else {
      return await getBatchSqlite(id);
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong fetching batch status";
    console.error("[GET /api/batches/:id]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Get batch from DynamoDB (AWS production mode).
 */
async function getBatchDynamoDB(id: string) {
  const { getBatch, getJobsByBatch } = await import("@/lib/db/dynamodb");

  const batch = await getBatch(id);

  if (!batch) {
    return Response.json(
      { error: "Batch not found — it may have been removed" },
      { status: 404 }
    );
  }

  const batchJobs = await getJobsByBatch(id);

  return Response.json({
    batch: {
      id: batch.id,
      status: batch.status,
      totalJobs: batch.totalJobs,
      completedJobs: batch.completedJobs,
      createdAt: new Date(batch.createdAt),
    },
    jobs: batchJobs.map((job) => ({
      id: job.id,
      videoId: job.videoId,
      kind: job.kind,
      quality: job.quality,
      status: job.status,
      progressPct: job.progressPct,
      error: job.error,
      outputPath: job.outputPath,
      s3Key: job.s3Key,
    })),
  });
}

/**
 * Get batch from SQLite (local development mode).
 */
async function getBatchSqlite(id: string) {
  const { db } = await import("@/lib/db");
  const { batches, jobs } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const batch = await db.query.batches.findFirst({
    where: eq(batches.id, id),
  });

  if (!batch) {
    return Response.json(
      { error: "Batch not found — it may have been removed" },
      { status: 404 }
    );
  }

  const batchJobs = await db.query.jobs.findMany({
    where: eq(jobs.batchId, id),
  });

  return Response.json({
    batch: {
      id: batch.id,
      status: batch.status,
      totalJobs: batch.totalJobs,
      completedJobs: batch.completedJobs,
      createdAt: batch.createdAt,
    },
    jobs: batchJobs.map((job) => ({
      id: job.id,
      videoId: job.videoId,
      kind: job.kind,
      quality: job.quality,
      status: job.status,
      progressPct: job.progressPct,
      error: job.error,
      outputPath: job.outputPath,
    })),
  });
}
