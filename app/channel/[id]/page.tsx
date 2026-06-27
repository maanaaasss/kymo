"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChannelHeader } from "@/components/channel/ChannelHeader";
import { VideoGrid } from "@/components/channel/VideoGrid";
import { Loader2 } from "lucide-react";

interface ChannelData {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
}

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [videoCount, setVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChannel() {
      try {
        const res = await fetch(`/api/channels/${id}?page=1&limit=1`);
        if (!res.ok) {
          setError("Channel not found");
          return;
        }
        const data = await res.json();
        setChannel(data.channel);
        setVideoCount(data.pagination.total);
      } catch {
        setError("Failed to load channel");
      } finally {
        setLoading(false);
      }
    }
    fetchChannel();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-[var(--text-muted)]">
        {error ?? "Channel not found"}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <ChannelHeader
        title={channel.title}
        videoCount={videoCount}
        thumbnailUrl={channel.thumbnailUrl}
        bannerUrl={channel.bannerUrl}
      />

      <main className="flex-1 mx-auto w-full max-w-[1200px] px-[var(--space-5)] py-[var(--space-5)]">
        <VideoGrid channelId={id} channelTitle={channel.title} />
      </main>
    </div>
  );
}
