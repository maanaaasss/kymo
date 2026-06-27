import { NextResponse } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { db } = await import("@/lib/db");
  const { channels } = await import("@/lib/db/schema");
  const { desc } = await import("drizzle-orm");

  try {
    const list = await db
      .select({
        id: channels.id,
        title: channels.title,
      })
      .from(channels)
      .orderBy(desc(channels.fetchedAt))
      .limit(5);

    return NextResponse.json({ channels: list });
  } catch (error) {
    console.error("Failed to fetch recent channels:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
