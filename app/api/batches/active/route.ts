import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";

export async function GET(_request: NextRequest) {
  const proxied = await proxyIfRemote(_request);
  if (proxied) return proxied;

  return Response.json(
    { error: "Backend not configured — set BACKEND_URL" },
    { status: 503 }
  );
}
