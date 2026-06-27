import { NextResponse } from "next/server";
import { checkSystemHealth } from "@/lib/binary-check";

/**
 * GET /api/health
 *
 * Checks system health: required binaries (yt-dlp, ffmpeg).
 * Used by the landing page on mount to show/hide the binary error banner.
 */
export async function GET() {
  const health = checkSystemHealth();

  return NextResponse.json(health, {
    status: health.healthy ? 200 : 503,
  });
}
