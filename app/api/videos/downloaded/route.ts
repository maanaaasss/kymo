import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { db } = await import("@/lib/db");
  const { downloadHistory } = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");

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

    const rows = await db
      .select()
      .from(downloadHistory)
      .where(inArray(downloadHistory.videoId, ids));

    const downloaded: Record<string, { kind: string; downloadedAt: string }> =
      {};

    for (const row of rows) {
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
