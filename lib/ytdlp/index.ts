import { spawn } from "child_process";
import type {
  YtDlpFlatVideoEntry,
  YtDlpFullVideo,
  ResolvedUrl,
} from "./types";
import { db } from "@/lib/db";
import { channels, videos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Spawn yt-dlp with the given arguments and collect stdout as a string.
 * Rejects with a user-friendly error message (Section 3.4 voice).
 */
function spawnYtDlp(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(
        new Error(
          "This is taking too long — the channel might be very large or YouTube isn't responding. Try again in a moment."
        )
      );
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        // Parse common yt-dlp errors into friendly messages
        if (stderr.includes("is not a valid URL") || stderr.includes("Unsupported URL")) {
          reject(
            new Error(
              "That doesn't look like a YouTube URL — check it and try again"
            )
          );
        } else if (stderr.includes("Private video") || stderr.includes("Sign in")) {
          reject(
            new Error(
              "This content might be private or age-restricted — it can't be accessed without authentication"
            )
          );
        } else if (
          stderr.includes("HTTP Error 404") ||
          stderr.includes("does not exist")
        ) {
          reject(
            new Error(
              "Couldn't find this content — the URL might be wrong or the video was deleted"
            )
          );
        } else if (stderr.includes("Unable to download")) {
          reject(
            new Error(
              "Couldn't reach YouTube — check your connection and try again"
            )
          );
        } else {
          reject(
            new Error(
              `yt-dlp failed: ${stderr.trim().split("\n").pop() || "unknown error"}`
            )
          );
        }
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "yt-dlp wasn't found on this machine — install it to get started"
          )
        );
      } else {
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      }
    });
  });
}

/**
 * Parse JSONL output (one JSON object per line) into an array.
 */
function parseJsonLines<T>(output: string): T[] {
  return output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

/**
 * Detect the URL type by checking common YouTube URL patterns.
 */
function detectUrlType(
  url: string
): "video" | "playlist" | "channel" | "unknown" {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace("www.", "").replace("m.", "");

    if (host !== "youtube.com" && host !== "youtu.be") {
      return "unknown";
    }

    // Video URLs
    if (host === "youtu.be") return "video";
    if (parsed.pathname === "/watch" && parsed.searchParams.has("v"))
      return "video";
    if (parsed.pathname.startsWith("/shorts/")) return "video";

    // Playlist URLs
    if (
      parsed.pathname === "/playlist" &&
      parsed.searchParams.has("list")
    )
      return "playlist";

    // Channel URLs: /@handle, /channel/ID, /c/name, /user/name
    if (
      parsed.pathname.startsWith("/@") ||
      parsed.pathname.startsWith("/channel/") ||
      parsed.pathname.startsWith("/c/") ||
      parsed.pathname.startsWith("/user/")
    ) {
      return "channel";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Get the best thumbnail URL from a thumbnails array.
 * Prefers the widest thumbnail (usually maxresdefault).
 */
function getBestThumbnail(
  thumbnails?: Array<{ url: string; width?: number; height?: number }>
): string | null {
  if (!thumbnails || thumbnails.length === 0) return null;
  const sorted = [...thumbnails].sort(
    (a, b) => (b.width || 0) - (a.width || 0)
  );
  return sorted[0].url;
}

/**
 * Extract channel profile (avatar) and banner image URLs from channel thumbnails.
 */
function extractChannelMetadata(
  thumbnails?: Array<{ url: string; id?: string; width?: number; height?: number }>
) {
  let avatarUrl: string | null = null;
  let bannerUrl: string | null = null;

  if (!thumbnails || thumbnails.length === 0) {
    return { avatarUrl, bannerUrl };
  }

  // 1. Try to find explicit avatar / banner IDs
  const avatarUncropped = thumbnails.find((t) => t.id === "avatar_uncropped");
  if (avatarUncropped) avatarUrl = avatarUncropped.url;

  const bannerUncropped = thumbnails.find((t) => t.id === "banner_uncropped");
  if (bannerUncropped) bannerUrl = bannerUncropped.url;

  // 2. If not found, look at other thumbnails in the list
  if (!avatarUrl) {
    // Avatar is usually square or has height/width close to equal
    const avatarCandidates = thumbnails.filter(
      (t) => (t.id && t.id.includes("avatar")) || (t.width && t.height && Math.abs(t.width - t.height) < 10)
    );
    if (avatarCandidates.length > 0) {
      avatarCandidates.sort((a, b) => (b.width || 0) - (a.width || 0));
      avatarUrl = avatarCandidates[0].url;
    }
  }

  if (!bannerUrl) {
    // Banner has very high aspect ratio (width > height * 2.5) or ID containing "banner"
    const bannerCandidates = thumbnails.filter(
      (t) => (t.id && t.id.includes("banner")) || (t.width && t.height && t.width > t.height * 2.5)
    );
    if (bannerCandidates.length > 0) {
      bannerCandidates.sort((a, b) => (b.width || 0) - (a.width || 0));
      bannerUrl = bannerCandidates[0].url;
    }
  }

  // Fallbacks: if we still don't have avatar, pick the first thumbnail that is not a banner candidate
  if (!avatarUrl) {
    const nonBanner = thumbnails.find((t) => !(t.width && t.height && t.width > t.height * 2.5));
    if (nonBanner) avatarUrl = nonBanner.url;
  }

  return { avatarUrl, bannerUrl };
}

/**
 * Parse yt-dlp's "YYYYMMDD" upload_date into a Unix timestamp (seconds).
 */
function parseUploadDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return new Date(`${year}-${month}-${day}T00:00:00Z`);
}

/**
 * Resolve a YouTube URL: detect type, fetch metadata, cache to SQLite.
 *
 * Strategy:
 * 1. Detect URL type from the URL pattern
 * 2. For any type, fetch the first video's full metadata to get channel info
 * 3. Fetch all video entries via --flat-playlist
 * 4. Cache channel + videos to SQLite
 */
export async function resolveUrl(url: string): Promise<ResolvedUrl> {
  const urlType = detectUrlType(url);

  if (urlType === "unknown") {
    throw new Error(
      "That doesn't look like a YouTube URL — check it and try again"
    );
  }

  // For videos, the URL itself is the video. For channels/playlists, we need
  // to get the channel's video tab URL.
  let channelVideosUrl: string;

  if (urlType === "video") {
    // For a single video URL, fetch its full metadata to get the channel
    channelVideosUrl = url;
  } else if (urlType === "playlist") {
    channelVideosUrl = url;
  } else {
    // Channel URL — ensure we're hitting the videos tab
    channelVideosUrl = url.replace(/\/$/, "") + "/videos";
  }

  // Step 1: Fetch metadata via --dump-single-json
  const playlistOutput = await spawnYtDlp([
    "--dump-single-json",
    "--playlist-items",
    "1",
    "--no-warnings",
    channelVideosUrl,
  ]);

  const playlistData = JSON.parse(playlistOutput.trim());
  const isPlaylist = playlistData._type === "playlist";
  const firstVideo = (isPlaylist ? playlistData.entries?.[0] : playlistData) as YtDlpFullVideo;

  if (!firstVideo || !firstVideo.channel_id) {
    throw new Error(
      "Couldn't determine the channel for this URL — try pasting a channel or video URL instead"
    );
  }

  const channelId = firstVideo.channel_id;
  const channelTitle = firstVideo.channel || firstVideo.uploader || "Unknown channel";

  // Extract channel banner/avatar from playlistData if it's a channel/playlist
  let avatarUrl: string | null = null;
  let bannerUrl: string | null = null;

  if (isPlaylist && playlistData.thumbnails) {
    const channelMeta = extractChannelMetadata(playlistData.thumbnails);
    avatarUrl = channelMeta.avatarUrl;
    bannerUrl = channelMeta.bannerUrl;
  }

  // Step 2: Cache the channel
  const now = new Date();
  const existingChannel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  });

  if (!existingChannel) {
    await db.insert(channels).values({
      id: channelId,
      title: channelTitle,
      thumbnailUrl: avatarUrl,
      bannerUrl: bannerUrl,
      fetchedAt: now,
    });
  } else {
    const updateValues: Record<string, any> = { title: channelTitle, fetchedAt: now };
    if (avatarUrl) updateValues.thumbnailUrl = avatarUrl;
    if (bannerUrl) updateValues.bannerUrl = bannerUrl;

    await db
      .update(channels)
      .set(updateValues)
      .where(eq(channels.id, channelId));
  }

  // Step 3: For a single video, just cache that one video
  if (urlType === "video") {
    await cacheVideoFromFull(firstVideo, channelId, now);

    return {
      type: "video",
      channelId,
      channelTitle,
      channelThumbnail: null,
      channelBanner: null,
      videoCount: 1,
    };
  }

  // Step 4: For channels/playlists, fetch all videos via --flat-playlist
  const flatOutput = await spawnYtDlp([
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    channelVideosUrl,
  ]);

  const flatVideos = parseJsonLines<YtDlpFlatVideoEntry>(flatOutput);

  // Step 5: Cache all videos to SQLite
  let cachedCount = 0;
  for (const entry of flatVideos) {
    if (!entry.id || !entry.title) continue;

    const existing = await db.query.videos.findFirst({
      where: eq(videos.id, entry.id),
    });

    if (!existing) {
      await db.insert(videos).values({
        id: entry.id,
        channelId,
        title: entry.title,
        durationSeconds: entry.duration ? Math.round(entry.duration) : null,
        thumbnailUrl: getBestThumbnail(entry.thumbnails),
        publishedAt: null, // Not available in flat mode
        availableFormats: null,
        fetchedAt: now,
      });
      cachedCount++;
    }
  }

  // Step 6: For channels, also fetch the /releases tab (albums/EPs).
  // The releases tab returns playlist references — expand each to get tracks.
  // Channels without a releases tab are handled gracefully (error is caught).
  let releasesCount = 0;
  if (urlType === "channel") {
    releasesCount = await fetchReleasesTab(url, channelId, now);
  }

  // Also ensure the first video (full metadata) is cached with its extra data
  await cacheVideoFromFull(firstVideo, channelId, now);

  return {
    type: urlType === "playlist" ? "playlist" : "channel",
    channelId,
    channelTitle,
    channelThumbnail: avatarUrl || (existingChannel?.thumbnailUrl ?? null),
    channelBanner: bannerUrl || (existingChannel?.bannerUrl ?? null),
    videoCount: flatVideos.length + releasesCount,
  };
}

/**
 * Cache a single video from full yt-dlp metadata.
 */
async function cacheVideoFromFull(
  video: YtDlpFullVideo,
  channelId: string,
  now: Date
) {
  const existing = await db.query.videos.findFirst({
    where: eq(videos.id, video.id),
  });

  const publishedAt = parseUploadDate(video.upload_date);

  if (!existing) {
    await db.insert(videos).values({
      id: video.id,
      channelId,
      title: video.title,
      durationSeconds: video.duration ? Math.round(video.duration) : null,
      thumbnailUrl:
        video.thumbnail || getBestThumbnail(video.thumbnails) || null,
      publishedAt,
      availableFormats: null,
      fetchedAt: now,
    });
  } else {
    // Update with richer data from full metadata
    await db
      .update(videos)
      .set({
        title: video.title,
        durationSeconds: video.duration ? Math.round(video.duration) : null,
        thumbnailUrl:
          video.thumbnail || getBestThumbnail(video.thumbnails) || existing.thumbnailUrl,
        publishedAt: publishedAt || existing.publishedAt,
        fetchedAt: now,
      })
      .where(eq(videos.id, video.id));
  }
}

/**
 * Fetch the /releases tab for a channel and cache all tracks.
 *
 * The releases tab returns playlist references (albums/EPs). Each playlist
 * is expanded via --flat-playlist to get individual video/track entries,
 * which are then cached to SQLite.
 *
 * Returns the number of new videos cached from releases.
 * Silently returns 0 if the channel has no releases tab.
 */
async function fetchReleasesTab(
  channelUrl: string,
  channelId: string,
  now: Date
): Promise<number> {
  const releasesUrl = channelUrl.replace(/\/?(videos|releases)?\/?$/, "") + "/releases";

  // Step 1: Fetch release playlist references from the releases tab
  let releasesOutput: string;
  try {
    releasesOutput = await spawnYtDlp([
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      releasesUrl,
    ]);
  } catch {
    // Channel has no releases tab — that's fine, not an error
    return 0;
  }

  if (!releasesOutput.trim()) return 0;

  // Parse the release entries — these are playlist references with ie_key: "YoutubeTab"
  interface ReleaseEntry {
    id: string;
    title: string;
    url: string;
    _type?: string;
    ie_key?: string;
  }

  const releaseEntries = parseJsonLines<ReleaseEntry>(releasesOutput);

  // Filter to playlist-type entries only (ie_key === "YoutubeTab")
  const playlistEntries = releaseEntries.filter(
    (e) => e.ie_key === "YoutubeTab" && e.url
  );

  if (playlistEntries.length === 0) return 0;

  // Step 2: Expand each release playlist to get individual tracks
  let totalCached = 0;

  for (const release of playlistEntries) {
    try {
      const playlistOutput = await spawnYtDlp([
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        release.url,
      ]);

      const tracks = parseJsonLines<YtDlpFlatVideoEntry>(playlistOutput);

      for (const track of tracks) {
        if (!track.id || !track.title) continue;

        const existing = await db.query.videos.findFirst({
          where: eq(videos.id, track.id),
        });

        if (!existing) {
          await db.insert(videos).values({
            id: track.id,
            channelId,
            title: track.title,
            durationSeconds: track.duration ? Math.round(track.duration) : null,
            thumbnailUrl: getBestThumbnail(track.thumbnails),
            publishedAt: null,
            availableFormats: null,
            fetchedAt: now,
          });
          totalCached++;
        }
      }
    } catch {
      // Individual release playlist failed — skip it, continue with others
      continue;
    }
  }

  return totalCached;
}
