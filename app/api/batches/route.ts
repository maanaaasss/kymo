import { NextRequest } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";
import { useDynamoDb } from "@/lib/db/repository";

export async function POST(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

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

    // Use DynamoDB + SQS if configured, otherwise use SQLite
    if (useDynamoDb()) {
      return await createBatchDynamoDB(batchId, videos, config, now);
    } else {
      return await createBatchSqlite(batchId, videos, config, now);
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong creating the batch — try again";
    console.error("[POST /api/batches]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Create batch using DynamoDB + SQS (AWS production mode).
 */
async function createBatchDynamoDB(
  batchId: string,
  videos: Array<{
    id: string;
    title: string;
    channelId: string;
    channelTitle?: string;
    kind?: string;
    imageUrl?: string;
    imageType?: string;
  }>,
  config: { kind: string; quality: string; includeThumbnail?: boolean; includeMetadata?: boolean },
  now: Date
) {
  const { createBatch, createJob } = await import("@/lib/db/dynamodb");
  const { enqueueJobs } = await import("@/lib/sqs");

  // Create batch record
  await createBatch({
    id: batchId,
    status: "pending",
    totalJobs: videos.length,
    completedJobs: 0,
    createdAt: now.toISOString(),
  });

  // Create job records and enqueue them
  const jobEntries: Array<{ jobId: string; batchId: string }> = [];

  for (const video of videos) {
    const jobId = crypto.randomUUID();
    const kind = (video.kind === "image" ? "image" : config.kind) as "video" | "audio" | "image";

    const quality = video.kind === "image"
      ? JSON.stringify({
          url: video.imageUrl,
          type: video.imageType,
          channelTitle: video.channelTitle || "Unknown Channel",
        })
      : config.quality;

    await createJob({
      id: jobId,
      batchId,
      videoId: video.kind === "image" ? null : video.id,
      kind,
      quality,
      includeThumbnail: video.kind === "image" ? false : config.includeThumbnail ?? false,
      includeMetadata: video.kind === "image" ? false : config.includeMetadata ?? false,
      status: "pending",
      progressPct: 0,
      outputPath: null,
      s3Key: null,
      error: null,
      createdAt: now.toISOString(),
      finishedAt: null,
    });

    jobEntries.push({ jobId, batchId });
  }

  // Enqueue all jobs to SQS
  await enqueueJobs(jobEntries);

  return Response.json({ batchId, totalJobs: videos.length });
}

/**
 * Create batch using SQLite (local development mode).
 */
async function createBatchSqlite(
  batchId: string,
  videos: Array<{
    id: string;
    title: string;
    channelId: string;
    channelTitle?: string;
    kind?: string;
    imageUrl?: string;
    imageType?: string;
  }>,
  config: { kind: string; quality: string; includeThumbnail?: boolean; includeMetadata?: boolean },
  now: Date
) {
  const { db } = await import("@/lib/db");
  const { batches, jobs } = await import("@/lib/db/schema");

  const jobRows = videos.map(
    (video) => ({
      id: crypto.randomUUID(),
      batchId,
      videoId: video.kind === "image" ? null : video.id,
      kind: (video.kind === "image" ? "image" : config.kind) as "video" | "audio" | "image",
      quality: video.kind === "image"
        ? JSON.stringify({
            url: video.imageUrl,
            type: video.imageType,
            channelTitle: video.channelTitle || "Unknown Channel",
          })
        : (config.quality as string),
      includeThumbnail: video.kind === "image" ? false : config.includeThumbnail ?? false,
      includeMetadata: video.kind === "image" ? false : config.includeMetadata ?? false,
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
}
