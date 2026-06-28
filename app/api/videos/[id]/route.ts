import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { videos, channels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing video ID" }, { status: 400 });
  }

  try {
    const video = await db.query.videos.findFirst({
      where: eq(videos.id, id),
    });

    if (!video) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    // Join with channel info
    const channel = video.channelId
      ? await db.query.channels.findFirst({
          where: eq(channels.id, video.channelId),
        })
      : null;

    return Response.json({
      video: {
        id: video.id,
        title: video.title,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        viewCount: video.viewCount,
        channelId: video.channelId,
        channelTitle: channel ? channel.title : "Unknown Channel",
        channelThumbnailUrl: channel ? channel.thumbnailUrl : null,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load video details" },
      { status: 500 }
    );
  }
}
