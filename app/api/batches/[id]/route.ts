import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  return Response.json(
    { error: "Backend not configured — set BACKEND_URL" },
    { status: 503 }
  );
}
