import { NextRequest } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { db } = await import("@/lib/db");
  const { batches, jobs } = await import("@/lib/db/schema");

  try {
    const body = await request.json();
    const { videos, config } = body;

    if (!Array.isArray(videos) || videos.length === 0) {
      return Response.json(
        { error: "Select at least one video to download" },
        { status: 400 }
      );
    }

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

    db.transaction((tx) => {
      tx.insert(batches)
        .values({
          id: batchId,
          status: "pending",
          totalJobs: videos.length,
          completedJobs: 0,
          createdAt: now,
        })
        .run();

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
