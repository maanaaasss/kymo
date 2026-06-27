import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
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
