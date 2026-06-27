import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { channels, videos } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

/**
 * GET /api/channels/[id]?page=1&limit=30
 *
 * Returns paginated video listing for a channel from SQLite cache.
 * Uses Next.js 16 async params pattern.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "30", 10))
  );
  const offset = (page - 1) * limit;

  // Fetch the channel
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, id),
  });

  if (!channel) {
    return Response.json(
      { error: "This channel hasn't been fetched yet — paste its URL on the home page to get started" },
      { status: 404 }
    );
  }

  // Count total videos for this channel
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(videos)
    .where(eq(videos.channelId, id))
    .get();

  const total = countResult?.count ?? 0;

  // Fetch paginated videos, newest first
  const videoList = await db
    .select()
    .from(videos)
    .where(eq(videos.channelId, id))
    .orderBy(desc(videos.fetchedAt))
    .limit(limit)
    .offset(offset);

  return Response.json({
    channel: {
      id: channel.id,
      title: channel.title,
      thumbnailUrl: channel.thumbnailUrl,
      bannerUrl: channel.bannerUrl,
    },
    videos: videoList.map((v) => ({
      id: v.id,
      title: v.title,
      durationSeconds: v.durationSeconds,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: v.publishedAt,
    })),
    pagination: {
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  });
}
