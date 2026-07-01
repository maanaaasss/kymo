# Kymo Architecture Plan

Last updated: 2026-06-30

## Executive Summary

Kymo is a YouTube video/channel downloader with a Next.js frontend and a Python backend running yt-dlp + ffmpeg. After exploring AWS Lambda (serverless), the project converged on a single-service Railway deployment for simplicity, cost, and reliability.

## Current Architecture

```
Browser → Vercel (Next.js, thin proxy) → Railway (FastAPI + yt-dlp + SQLite + local disk)
```

- **Vercel**: Hosts the Next.js frontend. All API routes are pure proxies to Railway — no business logic, no direct DB access.
- **Railway**: Single Python service running FastAPI. Handles URL resolution, batch creation, background downloading, and file serving via `FileResponse`.
- **Local disk**: Downloaded files live on Railway's ephemeral volume. Not durable across redeployments (acceptable for MVP).

## Why Not AWS Lambda?

The original plan used Lambda + SQS + DynamoDB + S3 + API Gateway. This was abandoned because:

1. **Complexity**: 6+ AWS services for what a single container does naturally.
2. **Lambda timeouts**: YouTube downloads can exceed 15 minutes; yt-dlp + ffmpeg need sustained compute.
3. **Cost at scale**: Lambda GB-seconds, S3 storage, data transfer, and CloudWatch add up fast.
4. **No free tier escape**: S3 lifecycle, DynamoDB TTL, CloudWatch retention — all require careful tuning.
5. **Debugging difficulty**: Lambda container packaging for yt-dlp + ffmpeg is fragile.

Railway Hobby plan ($5/mo) gives a single always-on container that handles everything.

## Backend Structure (`railway/`)

```
railway/
├── Dockerfile          # Python 3.11-slim + yt-dlp + ffmpeg + FastAPI
├── requirements.txt    # fastapi, uvicorn, yt-dlp==2026.6.9, pydantic
├── main.py             # App entry, lifespan (init_db + worker_loop)
├── db.py               # SQLite: batches, jobs, download_history
├── ytdlp.py            # run_ytdlp() with client rotation (android→ios→web)
├── worker.py           # asyncio.Queue background processor
└── routes/
    ├── health.py       # GET /health, GET /api/health
    ├── resolve.py      # POST /api/resolve-url
    ├── videos.py       # GET /api/videos/{id}, GET /api/videos/downloaded
    ├── channels.py     # GET /api/channels/{id}
    ├── batches.py      # POST /api/batches, GET active, GET by id
    └── download.py     # GET /api/batches/{id}/download → FileResponse
```

## Frontend Proxy Pattern

Every Next.js API route is a thin proxy:

```ts
// app/api/batches/route.ts
import { proxyIfRemote } from "@/lib/proxy";
export async function POST(req: Request) {
  return proxyIfRemote(`${BACKEND_URL}/api/batches`, { method: "POST", body: ... });
}
```

`proxyIfRemote` handles both local (direct) and remote (Railway) backends. For binary responses (file downloads), it detects `application/octet-stream` and passes through as `arrayBuffer`.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single Railway service | Simplicity over distributed architecture for MVP |
| SQLite over DynamoDB | No AWS dependency, easy local dev, sufficient for single-service |
| FileResponse over S3 pre-signed URLs | No S3 needed; Railway serves files directly |
| Client rotation (android→ios→web) | Primary mitigation for YouTube bot detection |
| yt-dlp pinned to 2026.6.9 | Reproducible builds; bump periodically |
| asyncio.Queue over SQS | No AWS dependency; queue lives in-process |
| No authentication (MVP) | Keep it simple; add if abuse becomes an issue |

## Environment Variables

### Railway (Backend)
- No special env vars needed — SQLite and local disk are defaults

### Vercel (Frontend)
- `BACKEND_URL` — Railway service URL (e.g., `https://kymo-api.up.railway.app`)

## Deployment

### Railway
1. Push `railway/` to Railway repo
2. Railway auto-builds Docker image
3. Service gets a public URL

### Vercel
1. Push Next.js frontend to Vercel
2. Set `BACKEND_URL` env var pointing to Railway
3. All API calls proxy through to Railway

## Future Improvements

- [ ] Cookie authentication for YouTube (rate-limit bypass)
- [ ] Zip downloads for multi-video batches
- [ ] Persistent volume for download cache
- [ ] Admin dashboard for monitoring
- [ ] Rate limiting and abuse prevention
