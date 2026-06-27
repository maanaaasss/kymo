"use client";

import { useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { VideoCard } from "./VideoCard";
import { VideoCardSkeleton } from "./VideoCardSkeleton";
import { useBasketStore, type BasketVideo } from "@/lib/store/basket";
import { Loader2 } from "lucide-react";

interface VideoData {
  id: string;
  title: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

interface ChannelResponse {
  channel: {
    id: string;
    title: string;
  };
  videos: VideoData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface VideoGridProps {
  channelId: string;
  channelTitle: string;
  initialData?: ChannelResponse;
}

/**
 * Responsive video grid with infinite "Load more" pagination
 * and multi-select (click to toggle, shift-click for range).
 */
export function VideoGrid({
  channelId,
  channelTitle,
  initialData,
}: VideoGridProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<ChannelResponse>({
    queryKey: ["channel-videos", channelId],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `/api/channels/${channelId}?page=${pageParam}&limit=30`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load videos");
      }
      return res.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? lastPage.pagination.page + 1
        : undefined,
    ...(initialData
      ? {
          initialData: {
            pages: [initialData],
            pageParams: [1],
          },
        }
      : {}),
  });

  // Basket store
  const basketItems = useBasketStore((s) => s.items);
  const toggle = useBasketStore((s) => s.toggle);
  const addRange = useBasketStore((s) => s.addRange);
  const lastSelectedIdRef = useRef<string | null>(null);

  // All videos across all pages
  const allVideos = data?.pages.flatMap((page) => page.videos) ?? [];
  const total = data?.pages[0]?.pagination.total ?? 0;

  // Fetch download status for all visible video IDs
  const videoIds = useMemo(
    () => allVideos.map((v) => v.id).join(","),
    [allVideos]
  );

  const { data: downloadedData } = useQuery<{
    downloaded: Record<string, { kind: string; downloadedAt: string }>;
  }>({
    queryKey: ["videos-downloaded", videoIds],
    queryFn: async () => {
      if (!videoIds) return { downloaded: {} };
      const res = await fetch(`/api/videos/downloaded?ids=${videoIds}`);
      if (!res.ok) return { downloaded: {} };
      return res.json();
    },
    enabled: videoIds.length > 0,
    staleTime: 30_000,
  });

  const downloadedIds = useMemo(
    () => new Set(Object.keys(downloadedData?.downloaded ?? {})),
    [downloadedData]
  );

  // Selection count for this channel
  const selectedCount = allVideos.filter((v) => !!basketItems[v.id]).length;

  /**
   * Convert a VideoData to a BasketVideo (adds channel context).
   */
  const toBasketVideo = useCallback(
    (v: VideoData): BasketVideo => ({
      id: v.id,
      title: v.title,
      durationSeconds: v.durationSeconds,
      thumbnailUrl: v.thumbnailUrl,
      channelId,
      channelTitle,
    }),
    [channelId, channelTitle]
  );

  /**
   * Handle video selection — toggle or shift-click range.
   */
  const handleSelect = useCallback(
    (videoId: string, shiftKey: boolean) => {
      const video = allVideos.find((v) => v.id === videoId);
      if (!video) return;

      if (shiftKey && lastSelectedIdRef.current) {
        // Shift-click: select range between last selected and current
        const lastIdx = allVideos.findIndex(
          (v) => v.id === lastSelectedIdRef.current
        );
        const currentIdx = allVideos.findIndex((v) => v.id === videoId);

        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          const rangeVideos = allVideos
            .slice(start, end + 1)
            .map(toBasketVideo);
          addRange(rangeVideos);
        }
      } else {
        // Regular click: toggle
        toggle(toBasketVideo(video));
      }

      lastSelectedIdRef.current = videoId;
    },
    [allVideos, toggle, addRange, toBasketVideo]
  );

  // Loading state — show skeleton grid
  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[var(--space-4)]">
        {Array.from({ length: 12 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-[var(--space-7)] text-center">
        <p className="text-[var(--text-body)] text-[var(--accent-red)]">
          {error instanceof Error
            ? error.message
            : "Something went wrong loading videos"}
        </p>
      </div>
    );
  }

  // Empty state
  if (allVideos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-[var(--space-7)] text-center">
        <p className="text-[var(--text-body)] text-[var(--text-secondary)]">
          No videos found for this channel — it might be empty or the content
          is unavailable
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Video count + selection count */}
      <div className="mb-[var(--space-4)] flex items-center gap-[var(--space-3)]">
        <p className="text-[var(--text-caption)] text-[var(--text-secondary)]">
          Showing <span className="mono-num">{allVideos.length}</span> of{" "}
          <span className="mono-num">{total}</span> videos
        </p>
        {selectedCount > 0 && (
          <span className="text-[var(--text-caption)] text-[var(--accent-ember)]">
            · <span className="mono-num">{selectedCount}</span> selected
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[var(--space-3)]">
        {allVideos.map((video) => (
          <VideoCard
            key={video.id}
            id={video.id}
            title={video.title}
            durationSeconds={video.durationSeconds}
            thumbnailUrl={video.thumbnailUrl}
            publishedAt={video.publishedAt}
            isSelected={!!basketItems[video.id]}
            isDownloaded={downloadedIds.has(video.id)}
            onSelect={(shiftKey) => handleSelect(video.id, shiftKey)}
          />
        ))}
      </div>

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center mt-[var(--space-6)] pb-[100px]">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-[var(--space-5)] py-[var(--space-3)] text-[var(--text-body)] text-[var(--text-primary)] font-medium transition-all duration-[140ms] ease-out hover:bg-[var(--bg-surface-raised)] hover:border-[var(--text-secondary)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Loading…
              </>
            ) : (
              "Load more videos"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
