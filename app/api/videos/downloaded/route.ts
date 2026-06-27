import { db } from "@/lib/db";
import { downloadHistory } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

/**
 * GET /api/videos/downloaded?ids=abc,def,ghi
 *
 * Given a comma-separated list of video IDs, returns which ones
 * have been previously downloaded (exist in download_history).
 *
 * Response: { downloaded: Record<string, { kind: string; downloadedAt: string }> }
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return Response.json(
        { error: "Missing 'ids' query parameter" },
        { status: 400 }
      );
    }

    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return Response.json({ downloaded: {} });
    }

    // Query download_history for these video IDs
    const rows = await db
      .select()
      .from(downloadHistory)
      .where(inArray(downloadHistory.videoId, ids));

    // Build a lookup map: videoId → { kind, downloadedAt }
    const downloaded: Record<string, { kind: string; downloadedAt: string }> =
      {};

    for (const row of rows) {
      // If a video has multiple downloads (video + audio), keep the most recent
      const existing = downloaded[row.videoId];
      if (
        !existing ||
        new Date(row.downloadedAt).getTime() >
          new Date(existing.downloadedAt).getTime()
      ) {
        downloaded[row.videoId] = {
          kind: row.kind,
          downloadedAt: new Date(row.downloadedAt).toISOString(),
        };
      }
    }

    return Response.json({ downloaded });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong checking download history";

    console.error("[GET /api/videos/downloaded]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
