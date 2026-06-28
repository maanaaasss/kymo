import { NextRequest } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { db } = await import("@/lib/db");
  const { channels, videos } = await import("@/lib/db/schema");
  const { eq, desc, sql, and } = await import("drizzle-orm");

  const { id } = await params;

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "30", 10))
  );
  const offset = (page - 1) * limit;
  const tab = searchParams.get("tab") || "videos";

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, id),
  });

  if (!channel) {
    return Response.json(
      { error: "This channel hasn't been fetched yet — paste its URL on the home page to get started" },
      { status: 404 }
    );
  }

  // 1. Calculate which tabs are non-empty for this channel
  const tabsResult = await db
    .select({ tab: videos.tab, count: sql<number>`count(*)` })
    .from(videos)
    .where(eq(videos.channelId, id))
    .groupBy(videos.tab);

  const availableTabs = tabsResult
    .filter((t) => t.count > 0)
    .map((t) => t.tab);

  // 2. Fetch total and videos filtered by the selected tab
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(videos)
    .where(and(eq(videos.channelId, id), eq(videos.tab, tab)))
    .get();

  const total = countResult?.count ?? 0;

  const videoList = await db
    .select()
    .from(videos)
    .where(and(eq(videos.channelId, id), eq(videos.tab, tab)))
    .orderBy(desc(videos.fetchedAt))
    .limit(limit)
    .offset(offset);

  return Response.json({
    channel: {
      id: channel.id,
      title: channel.title,
      thumbnailUrl: channel.thumbnailUrl,
      bannerUrl: channel.bannerUrl,
      handle: (channel as any).handle,
      subscriberCount: (channel as any).subscriberCount,
      description: (channel as any).description,
      verified: !!(channel as any).verified,
    },
    videos: videoList.map((v) => ({
      id: v.id,
      title: v.title,
      durationSeconds: v.durationSeconds,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: v.publishedAt,
    })),
    availableTabs: availableTabs.length > 0 ? availableTabs : ["videos"],
    pagination: {
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  });
}
