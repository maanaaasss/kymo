import { NextRequest, NextResponse } from "next/server";

/**
 * If BACKEND_URL is set (Vercel deployment), proxy the request to the
 * Railway backend and return the response. Returns null if BACKEND_URL
 * is not set, meaning the route should handle locally (Railway).
 */
export async function proxyIfRemote(
  request: NextRequest,
  overridePath?: string
): Promise<NextResponse | null> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return null;

  const url = new URL(request.url);
  const path = overridePath ?? url.pathname + url.search;

  const backendBase = backendUrl.replace(/\/$/, "");
  const targetUrl = `${backendBase}${path}`;

  const headers = new Headers();
  // Forward content-type for POST requests
  if (request.headers.get("content-type")) {
    headers.set("content-type", request.headers.get("content-type")!);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(targetUrl, {
      ...init,
      signal: AbortSignal.timeout(60000),
    });


    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error(`[proxy] Failed to reach backend at ${targetUrl}`, err);
    return NextResponse.json(
      { error: "Backend unavailable — try again in a moment" },
      { status: 502 }
    );
  }
}
