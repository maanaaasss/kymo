import { NextRequest } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  return Response.json(
    { error: "Backend not configured — set BACKEND_URL" },
    { status: 503 }
  );
}
