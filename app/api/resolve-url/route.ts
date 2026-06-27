import { NextRequest } from "next/server";
import { resolveUrl } from "@/lib/ytdlp";

/**
 * POST /api/resolve-url
 *
 * Resolves a YouTube URL: detects type (video/channel/playlist),
 * fetches metadata via yt-dlp, caches to SQLite, returns result.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return Response.json(
        { error: "Paste a YouTube URL to get started" },
        { status: 400 }
      );
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return Response.json(
        { error: "Paste a YouTube URL to get started" },
        { status: 400 }
      );
    }

    const result = await resolveUrl(trimmedUrl);

    return Response.json(result);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong — try again in a moment";

    return Response.json({ error: message }, { status: 422 });
  }
}
