import { NextResponse } from "next/server";
import { proxyIfRemote } from "@/lib/proxy";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const proxied = await proxyIfRemote(request);
  if (proxied) return proxied;

  const { checkSystemHealth } = await import("@/lib/binary-check");
  const health = checkSystemHealth();
  return NextResponse.json(health, { status: health.healthy ? 200 : 503 });
}
