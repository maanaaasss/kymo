import { db } from "@/lib/db";
import { batches, jobs, videos } from "@/lib/db/schema";
import { eq, or, desc } from "drizzle-orm";

/**
 * Enrich a batch's jobs with video metadata.
 */
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

/**
 * GET /api/batches/active
 *
 * Returns all non-completed batches with their jobs and video metadata,
 * plus the most recently completed batch (for ZIP download).
 *
 * Response: {
 *   batches: Array<{ batch, jobs }>,
 *   recentCompleted: { batch, jobs } | null
 * }
 */
export async function GET() {
  try {
    // Fetch all active (non-terminal) batches
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

    // Fetch the most recently completed/partial batch (for ZIP export)
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
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong fetching active downloads";

    console.error("[GET /api/batches/active]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
