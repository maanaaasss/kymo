import { NextRequest } from "next/server";
import { useDynamoDb } from "@/lib/db/repository";

export async function GET(_request: NextRequest) {
  try {
    if (useDynamoDb()) {
      return await getActiveBatchesDynamoDB();
    }
    return await getActiveBatchesSqlite();
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong fetching active downloads";
    console.error("[GET /api/batches/active]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function getActiveBatchesDynamoDB() {
  const { getActiveBatches, getJobsByBatch } = await import("@/lib/db/dynamodb");

  const activeBatches = await getActiveBatches();

  const result = [];
  for (const batch of activeBatches) {
    const batchJobs = await getJobsByBatch(batch.id);
    result.push({
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
        videoTitle: "Unknown video",
        videoThumbnail: null,
        kind: job.kind,
        quality: job.quality,
        status: job.status,
        progressPct: job.progressPct,
        error: job.error,
      })),
    });
  }

  return Response.json({ batches: result, recentCompleted: null });
}

async function getActiveBatchesSqlite() {
  const { db } = await import("@/lib/db");
  const { batches, jobs, videos } = await import("@/lib/db/schema");
  const { eq, or, desc } = await import("drizzle-orm");

  async function enrichBatch(batch: {
    id: string;
    status: string;
    totalJobs: number;
    completedJobs: number;
    createdAt: Date;
  }) {
    const batchJobs = await db.query.jobs.findMany({
      where: eq(jobs.batchId, batch.id),
    });

    const enrichedJobs = [];
    for (const job of batchJobs) {
      let videoTitle = "Unknown video";
      let videoThumbnail: string | null = null;

      if (job.videoId) {
        const video = await db.query.videos.findFirst({
          where: eq(videos.id, job.videoId),
        });
        if (video) {
          videoTitle = video.title;
          videoThumbnail = video.thumbnailUrl;
        }
      }

      enrichedJobs.push({
        id: job.id,
        videoId: job.videoId,
        videoTitle,
        videoThumbnail,
        kind: job.kind,
        quality: job.quality,
        status: job.status,
        progressPct: job.progressPct,
        error: job.error,
      });
    }

    return {
      batch: {
        id: batch.id,
        status: batch.status,
        totalJobs: batch.totalJobs,
        completedJobs: batch.completedJobs,
        createdAt: batch.createdAt,
      },
      jobs: enrichedJobs,
    };
  }

  const activeBatches = await db.query.batches.findMany({
    where: or(
      eq(batches.status, "pending"),
      eq(batches.status, "running")
    ),
  });

  const result = [];
  for (const batch of activeBatches) {
    result.push(await enrichBatch(batch));
  }

  const recentDone = await db.query.batches.findFirst({
    where: or(
      eq(batches.status, "done"),
      eq(batches.status, "partial")
    ),
    orderBy: desc(batches.createdAt),
  });

  let recentCompleted = null;
  if (recentDone) {
    recentCompleted = await enrichBatch(recentDone);
  }

  return Response.json({ batches: result, recentCompleted });
}
