import { NextRequest } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { resolveUrl } = await import("@/lib/ytdlp");

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
