import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { batches, jobs } from "@/lib/db/schema";

/**
 * POST /api/batches
 *
 * Creates a download batch from the basket.
 * Inserts 1 batch row + N job rows (one per video) in a single transaction.
 * Returns immediately — no yt-dlp work happens here.
 *
 * Request body:
 *   videos: Array<{ id, title, channelId, channelTitle }>
 *   config: { kind, quality, includeThumbnail, includeMetadata }
 *
 * Response:
 *   { batchId, totalJobs }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos, config } = body;

    // Validate videos array
    if (!Array.isArray(videos) || videos.length === 0) {
      return Response.json(
        { error: "Select at least one video to download" },
        { status: 400 }
      );
    }

    // Validate config
    if (
      !config ||
      !config.kind ||
      !config.quality ||
      !["video", "audio"].includes(config.kind)
    ) {
      return Response.json(
        { error: "Choose a format and quality before downloading" },
        { status: 400 }
      );
    }

    const batchId = crypto.randomUUID();
    const now = new Date();

    // Single transaction: create batch + all jobs atomically
    const jobRows = videos.map(
      (video: { id: string; title: string; channelId: string }) => ({
        id: crypto.randomUUID(),
        batchId,
        videoId: video.id,
        kind: config.kind as "video" | "audio",
        quality: config.quality as string,
        includeThumbnail: config.includeThumbnail ?? false,
        includeMetadata: config.includeMetadata ?? false,
        status: "pending" as const,
        progressPct: 0,
        createdAt: now,
      })
    );

    // Use Drizzle's transaction for atomicity
    // Note: better-sqlite3 driver is synchronous — use .run() to execute queries
    db.transaction((tx) => {
      tx.insert(batches).values({
        id: batchId,
        status: "pending",
        totalJobs: videos.length,
        completedJobs: 0,
        createdAt: now,
      }).run();

      for (const job of jobRows) {
        tx.insert(jobs).values(job).run();
      }
    });

    return Response.json({ batchId, totalJobs: videos.length });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong creating the batch — try again";

    console.error("[POST /api/batches]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
