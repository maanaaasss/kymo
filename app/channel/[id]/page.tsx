import { db } from "@/lib/db";
import { channels, videos } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChannelHeader } from "@/components/channel/ChannelHeader";
import { VideoGrid } from "@/components/channel/VideoGrid";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Channel browsing page.
 *
 * Server component that pre-fetches the channel and first page of videos
 * from SQLite for instant load. Client-side VideoGrid handles pagination
 * via TanStack Query.
 */
export default async function ChannelPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch channel from SQLite
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, id),
  });

  if (!channel) {
    notFound();
  }

  // Fetch first page of videos server-side
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(videos)
    .where(eq(videos.channelId, id))
    .get();

  const total = countResult?.count ?? 0;

  const videoList = await db
    .select()
    .from(videos)
    .where(eq(videos.channelId, id))
    .orderBy(desc(videos.fetchedAt))
    .limit(30)
    .offset(0);

  const initialData = {
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
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    })),
    pagination: {
      page: 1,
      limit: 30,
      total,
      hasMore: 30 < total,
    },
  };

  return (
    <div className="flex flex-col flex-1">
      <ChannelHeader
        title={channel.title}
        videoCount={total}
        thumbnailUrl={channel.thumbnailUrl}
        bannerUrl={channel.bannerUrl}
      />

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-[var(--space-5)] py-[var(--space-5)]">
        <VideoGrid channelId={id} channelTitle={channel.title} initialData={initialData} />
      </main>
    </div>
  );
}
