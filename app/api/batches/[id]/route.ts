import { db } from "@/lib/db";
import { batches, jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/batches/[id]
 *
 * Returns the batch status and all its jobs.
 * Used by TanStack Query to poll download progress (Phase 4).
 *
 * Next.js 16: params is a Promise that must be awaited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong fetching batch status";

    console.error("[GET /api/batches/:id]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
