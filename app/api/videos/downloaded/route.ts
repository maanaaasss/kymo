import { NextRequest } from "next/server";
import { useDynamoDb } from "@/lib/db/repository";

export async function GET(request: NextRequest) {
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

    if (useDynamoDb()) {
      return await getDownloadedDynamoDB(ids);
    }
    return await getDownloadedSqlite(ids);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Something went wrong checking download history";
    console.error("[GET /api/videos/downloaded]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function getDownloadedDynamoDB(ids: string[]) {
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
  const { docClient, AWS_RESOURCES } = await import("@/lib/aws/config");

  const result = await docClient.send(
    new ScanCommand({
      TableName: AWS_RESOURCES.DOWNLOAD_HISTORY_TABLE,
      FilterExpression: "video_id IN :ids",
      ExpressionAttributeValues: { ":ids": ids },
    })
  );

  const downloaded: Record<string, { kind: string; downloadedAt: string }> = {};

  for (const item of result.Items || []) {
    const vid = item.video_id as string;
    const existing = downloaded[vid];
    if (
      !existing ||
      new Date(item.downloaded_at as string).getTime() >
        new Date(existing.downloadedAt).getTime()
    ) {
      downloaded[vid] = {
        kind: item.kind as string,
        downloadedAt: item.downloaded_at as string,
      };
    }
  }

  return Response.json({ downloaded });
}

async function getDownloadedSqlite(ids: string[]) {
  const { db } = await import("@/lib/db");
  const { downloadHistory } = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(downloadHistory)
    .where(inArray(downloadHistory.videoId, ids));

  const downloaded: Record<string, { kind: string; downloadedAt: string }> = {};

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
}
