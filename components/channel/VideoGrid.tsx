"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  availableTabs: string[];
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
  const [activeTab, setActiveTab] = useState<string>("videos");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [activeFilter, setActiveFilter] = useState<"all" | "not-saved" | "long-form">("all");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery<ChannelResponse>({
    queryKey: ["channel-videos", channelId, activeTab],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `/api/channels/${channelId}?page=${pageParam}&limit=30&tab=${activeTab}`
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
    ...(initialData && activeTab === "videos"
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
  const remove = useBasketStore((s) => s.remove);
  const lastSelectedIdRef = useRef<string | null>(null);

  // All videos across all pages
  const allVideos = data?.pages.flatMap((page) => page.videos) ?? [];
  const total = data?.pages[0]?.pagination.total ?? 0;
  const availableTabs = data?.pages[0]?.availableTabs ?? ["videos"];

  // Sort tabs in fixed order: Videos -> Shorts -> Playlists -> Releases
  const TAB_ORDER = ["videos", "shorts", "playlists", "releases"];
  const sortedAvailableTabs = useMemo(() => {
    return [...availableTabs].sort((a, b) => TAB_ORDER.indexOf(a) - TAB_ORDER.indexOf(b));
  }, [availableTabs]);

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

  // Pre-calculate chronological index for loaded videos (newest first in allVideos)
  const videosWithIndex = useMemo(() => {
    return allVideos.map((video, idx) => ({
      ...video,
      uploadIndex: total - idx,
    }));
  }, [allVideos, total]);

  // Apply filter and sort order to the list of videos
  const processedVideos = useMemo(() => {
    let result = [...videosWithIndex];

    // Filter
    if (activeFilter === "not-saved") {
      result = result.filter((v) => !downloadedIds.has(v.id));
    } else if (activeFilter === "long-form") {
      result = result.filter(
        (v) => v.durationSeconds !== null && v.durationSeconds >= 1800
      );
    }

    // Sort
    if (sortOrder === "oldest") {
      result.reverse();
    }

    return result;
  }, [videosWithIndex, activeFilter, sortOrder, downloadedIds]);

  const visibleIds = useMemo(() => processedVideos.map((v) => v.id), [processedVideos]);
  const areAllSelected = useMemo(() => {
    return visibleIds.length > 0 && visibleIds.every((id) => !!basketItems[id]);
  }, [visibleIds, basketItems]);

  // Selection count for this channel
  const selectedCount = processedVideos.filter((v) => !!basketItems[v.id]).length;

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
      const video = processedVideos.find((v) => v.id === videoId);
      if (!video) return;

      if (shiftKey && lastSelectedIdRef.current) {
        const lastIdx = processedVideos.findIndex(
          (v) => v.id === lastSelectedIdRef.current
        );
        const currentIdx = processedVideos.findIndex((v) => v.id === videoId);

        if (lastIdx !== -1 && currentIdx !== -1) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          const rangeVideos = processedVideos
            .slice(start, end + 1)
            .map(toBasketVideo);
          addRange(rangeVideos);
        }
      } else {
        toggle(toBasketVideo(video));
      }
      lastSelectedIdRef.current = videoId;
    },
    [processedVideos, toggle, addRange, toBasketVideo]
  );

  const handleSelectAll = useCallback(() => {
    if (areAllSelected) {
      // Deselect all currently visible
      for (const id of visibleIds) {
        if (basketItems[id]) {
          remove(id);
        }
      }
    } else {
      // Select all currently visible
      const toAdd: BasketVideo[] = processedVideos
        .filter((v) => !basketItems[v.id])
        .map((v) => ({
          id: v.id,
          title: v.title,
          durationSeconds: v.durationSeconds,
          thumbnailUrl: v.thumbnailUrl,
          channelId,
          channelTitle,
        }));
      addRange(toAdd);
    }
  }, [areAllSelected, visibleIds, processedVideos, basketItems, remove, addRange, channelId, channelTitle]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[var(--space-3)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-[var(--space-7)] text-center text-[var(--accent-red)]">
        <p>{error instanceof Error ? error.message : "Failed to load videos"}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Underline Tabs - horizontally scrollable without wrapping on mobile */}
      {sortedAvailableTabs.length > 1 && (
        <div className="flex gap-[var(--space-5)] border-b border-[var(--border-subtle)] mb-[var(--space-5)] overflow-x-auto scrollbar-none flex-nowrap whitespace-nowrap">
          {sortedAvailableTabs.map((tab) => {
            const label = tab.charAt(0).toUpperCase() + tab.slice(1);
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  lastSelectedIdRef.current = null;
                }}
                className={`relative pb-3 text-[14px] font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
                {isActive && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-ember)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Actions Row - scrollable horizontal container on mobile */}
      <div className="flex items-center gap-[var(--space-3)] mb-6 mt-4 w-full overflow-x-auto scrollbar-none pb-2 sm:pb-0 flex-nowrap">
        {/* Select All */}
        <button
          onClick={handleSelectAll}
          className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-raised)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer select-none"
        >
          {areAllSelected ? "Deselect all" : "Select all"}
        </button>

        {/* Sort Dropdown */}
        <div className="relative shrink-0 select-none">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-raised)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] cursor-pointer outline-none appearance-none pr-8 relative"
            style={{
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239A9AA2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              backgroundSize: "14px",
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-[var(--border-subtle)] shrink-0" />

        {/* Filter Chips */}
        <div className="flex gap-2 shrink-0">
          {(["all", "not-saved", "long-form"] as const).map((filter) => {
            const label =
              filter === "all"
                ? "All"
                : filter === "not-saved"
                ? "Not yet saved"
                : "Long-form (30m+)";
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all cursor-pointer select-none ${
                  isActive
                    ? "border-[var(--accent-ember)] bg-[var(--accent-ember)]/8 text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[#3E404D]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Video count + selection count */}
      <div className="mb-[var(--space-4)] flex items-center gap-[var(--space-3)]">
        <p className="text-[var(--text-caption)] text-[var(--text-secondary)]">
          Showing <span className="mono-num">{processedVideos.length}</span> of{" "}
          <span className="mono-num">{total}</span> items
        </p>
        {selectedCount > 0 && (
          <span className="text-[var(--text-caption)] text-[var(--accent-ember)]">
            · <span className="mono-num">{selectedCount}</span> selected
          </span>
        )}
      </div>

      {/* Video Grid - switches to single-column list-row layout on mobile */}
      {processedVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-[var(--space-7)] text-center">
          <p className="text-[var(--text-body)] text-[var(--text-secondary)]">
            No items match the selected filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[var(--space-2)] sm:gap-[var(--space-3)]">
          {processedVideos.map((video) => (
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
              uploadIndex={video.uploadIndex}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center mt-[var(--space-6)] pb-[100px]">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-[var(--space-5)] py-[var(--space-3)] text-[var(--text-body)] text-[var(--text-primary)] font-medium transition-all duration-[140ms] ease-out hover:bg-[var(--bg-surface-raised)] hover:border-[var(--text-secondary)]/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
