import { NextRequest } from "next/server";
import { useDynamoDb } from "@/lib/db/repository";

/**
 * GET /api/batches/[id]/download?jobId=xxx
 *
 * Returns a pre-signed URL for downloading a completed job's output.
 * The URL is short-lived (15 minutes) and requires no authentication.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return Response.json(
        { error: "jobId query parameter is required" },
        { status: 400 }
      );
    }

    if (useDynamoDb()) {
      return await getDownloadUrlDynamoDB(id, jobId);
    } else {
      return await getDownloadUrlSqlite(id, jobId);
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong generating download URL";
    console.error("[GET /api/batches/:id/download]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Get download URL from DynamoDB + S3 (AWS production mode).
 */
async function getDownloadUrlDynamoDB(batchId: string, jobId: string) {
  const { getJob } = await import("@/lib/db/dynamodb");
  const { getShortLivedUrl } = await import("@/lib/s3");
  const path = await import("path");

  const job = await getJob(jobId);

  if (!job) {
    return Response.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  if (job.batchId !== batchId) {
    return Response.json(
      { error: "Job does not belong to this batch" },
      { status: 400 }
    );
  }

  if (job.status !== "done") {
    return Response.json(
      { error: "Job is not complete yet" },
      { status: 400 }
    );
  }

  if (!job.s3Key) {
    return Response.json(
      { error: "Download URL not available" },
      { status: 404 }
    );
  }

  // Generate a short-lived pre-signed URL
  const filename = path.basename(job.s3Key);
  const url = await getShortLivedUrl(job.s3Key, filename);

  return Response.json({
    url,
    expiresIn: 900, // 15 minutes
    filename,
    kind: job.kind,
  });
}

/**
 * Get download URL from SQLite (local development mode).
 * In local mode, returns the local file path (for development only).
 */
async function getDownloadUrlSqlite(batchId: string, jobId: string) {
  const { db } = await import("@/lib/db");
  const { jobs } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const job = await db.query.jobs.findFirst({
    where: and(eq(jobs.id, jobId), eq(jobs.batchId, batchId)),
  });

  if (!job) {
    return Response.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  if (job.status !== "done") {
    return Response.json(
      { error: "Job is not complete yet" },
      { status: 400 }
    );
  }

  if (!job.outputPath) {
    return Response.json(
      { error: "Output file path not available" },
      { status: 404 }
    );
  }

  // In local mode, return the file path (for development/debugging)
  return Response.json({
    localPath: job.outputPath,
    kind: job.kind,
    note: "Local development mode — use file server for downloads",
  });
}
