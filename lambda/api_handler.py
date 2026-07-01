"""
FastAPI backend for Kymo — owns ALL data operations.

Deployed as a Lambda behind API Gateway. Vercel frontend proxies
every request here via proxyIfRemote(BACKEND_URL).

Responsibilities:
- yt-dlp operations (resolve URL, video metadata, channel browse)
- Batch management (create, status, active, download)
- Download history queries
"""

import json
import os
import re
import subprocess
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── AWS ──────────────────────────────────────────────────────────────────────

REGION = os.environ.get("KYMO_REGION", "ap-south-2")
BATCHES_TABLE = os.environ.get("DYNAMODB_BATCHES_TABLE", "kymo-batches")
JOBS_TABLE = os.environ.get("DYNAMODB_JOBS_TABLE", "kymo-jobs")
HISTORY_TABLE = os.environ.get("DYNAMODB_DOWNLOAD_HISTORY_TABLE", "kymo-download-history")
OUTPUTS_BUCKET = os.environ.get("S3_OUTPUTS_BUCKET", "kymo-outputs")
DOWNLOAD_QUEUE = os.environ.get("SQS_DOWNLOAD_QUEUE", "")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
sqs = boto3.client("sqs", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)

batches_table = dynamodb.Table(BATCHES_TABLE)
jobs_table = dynamodb.Table(JOBS_TABLE)
history_table = dynamodb.Table(HISTORY_TABLE)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Kymo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── yt-dlp helpers ──────────────────────────────────────────────────────────

def run_ytdlp(args: list[str], timeout: int = 30) -> str:
    """Run yt-dlp and return stdout."""
    env = os.environ.copy()
    env["PATH"] = f"/opt/ffmpeg:{env.get('PATH', '')}"
    env["TMPDIR"] = "/tmp"
    env["TEMP"] = "/tmp"
    env["TMP"] = "/tmp"
    try:
        result = subprocess.run(
            ["yt-dlp", "--cache-dir", "/tmp", *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )
    except FileNotFoundError:
        raise HTTPException(500, "yt-dlp not installed")
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "yt-dlp timed out")
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "is not a valid URL" in stderr or "Unsupported URL" in stderr:
            raise HTTPException(422, "That doesn't look like a YouTube URL")
        if "Private video" in stderr or "Sign in" in stderr:
            raise HTTPException(422, "This content might be private or age-restricted")
        raise HTTPException(502, stderr[:500] or f"yt-dlp exited with code {result.returncode}")
    return result.stdout


def detect_url_type(url: str) -> str:
    if re.search(r"youtube\.com/watch|youtu\.be/", url):
        return "video"
    if re.search(r"youtube\.com/playlist|list=", url):
        return "playlist"
    if re.search(r"youtube\.com/(c/|channel/|@)", url):
        return "channel"
    return "unknown"


def best_thumbnail(thumbnails: list[dict] | None) -> str | None:
    if not thumbnails:
        return None
    best = max(thumbnails, key=lambda t: (t.get("height", 0) or 0) * (t.get("width", 0) or 0))
    return best.get("url")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
@app.get("/health")
def health():
    env = os.environ.copy()
    env["PATH"] = f"/opt/ffmpeg:{env.get('PATH', '')}"

    def check_bin(name: str, check_arg: str = "--version") -> dict:
        for p in [f"/opt/ffmpeg/{name}", f"/usr/local/bin/{name}", f"/usr/bin/{name}", f"/var/lang/bin/{name}"]:
            if os.path.exists(p):
                try:
                    v = subprocess.run([p, check_arg], capture_output=True, text=True, timeout=5, env=env).stdout.strip().split("\n")[0]
                except Exception:
                    v = "installed"
                return {"name": name, "found": True, "version": v, "path": p}
        try:
            v = subprocess.run(["which", name], capture_output=True, text=True, timeout=5, env=env).stdout.strip()
            if v:
                try:
                    ver = subprocess.run([v, check_arg], capture_output=True, text=True, timeout=5, env=env).stdout.strip().split("\n")[0]
                except Exception:
                    ver = "installed"
                return {"name": name, "found": True, "version": ver, "path": v}
        except Exception:
            pass
        return {"name": name, "found": False, "version": None, "path": None}

    yt_dlp = check_bin("yt-dlp")
    ffmpeg = check_bin("ffmpeg", "-version")
    return {
        "healthy": yt_dlp["found"] and ffmpeg["found"],
        "binaries": {"ytDlp": yt_dlp, "ffmpeg": ffmpeg},
    }


# ─── Resolve URL ──────────────────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    url: str


@app.post("/api/resolve-url")
@app.post("/resolve")
def resolve_url(req: ResolveRequest):
    url = req.url.strip()
    url_type = detect_url_type(url)
    if url_type == "unknown":
        raise HTTPException(422, "That doesn't look like a YouTube URL")

    channel_url = url
    if url_type == "channel" and not url.endswith("/videos"):
        channel_url = url.rstrip("/") + "/videos"

    output = run_ytdlp(["--dump-single-json", "--playlist-items", "1", "--no-warnings", channel_url])
    data = json.loads(output)
    is_playlist = data.get("_type") == "playlist"
    first = (data.get("entries") or [{}])[0] if is_playlist else data

    if not first.get("channel_id"):
        raise HTTPException(422, "Couldn't determine the channel for this URL")

    channel_id = first["channel_id"]
    channel_title = first.get("channel") or first.get("uploader") or "Unknown"

    # Try to get channel thumbnails
    avatar = banner = None
    try:
        ch_output = run_ytdlp(["--dump-single-json", "--playlist-items", "1", "--no-warnings",
                                f"https://www.youtube.com/channel/{channel_id}/videos"])
        ch_data = json.loads(ch_output)
        thumbs = ch_data.get("thumbnails", [])
        for t in thumbs:
            if t.get("id") == "avatar" or (t.get("height", 0) >= 100 and "avatar" in t.get("url", "")):
                avatar = t.get("url")
            if t.get("id") == "banner" or (t.get("height", 0) >= 200 and "banner" in t.get("url", "")):
                banner = t.get("url")
    except Exception:
        pass

    video_count = data.get("playlist_count") or (len(data.get("entries", [])) if is_playlist else 1)

    return {
        "type": url_type,
        "channelId": channel_id,
        "channelTitle": channel_title,
        "channelThumbnail": avatar,
        "channelBanner": banner,
        "videoCount": video_count,
        "videoId": first.get("id"),
    }


# ─── Video Metadata ───────────────────────────────────────────────────────────

@app.get("/api/videos/{video_id}")
@app.get("/video/{video_id}")
def get_video(video_id: str):
    output = run_ytdlp([
        "--dump-json", "--no-warnings", "--no-playlist",
        f"https://www.youtube.com/watch?v={video_id}",
    ])
    info = json.loads(output)

    upload_date = info.get("upload_date", "")
    published = None
    if upload_date and len(upload_date) == 8:
        published = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"

    return {
        "video": {
            "id": info.get("id"),
            "title": info.get("title"),
            "durationSeconds": round(info["duration"]) if info.get("duration") else None,
            "thumbnailUrl": info.get("thumbnail"),
            "publishedAt": published,
            "viewCount": info.get("view_count"),
            "channelId": info.get("channel_id"),
            "channelTitle": info.get("channel") or "Unknown",
            "channelThumbnailUrl": None,
        }
    }


# ─── Channel Browse ───────────────────────────────────────────────────────────

@app.get("/api/channels/{channel_id}")
@app.get("/channel/{channel_id}")
def get_channel(channel_id: str, page: int = 1, limit: int = 30, tab: str = "videos"):
    channel_url = f"https://www.youtube.com/channel/{channel_id}/{tab}"
    output = run_ytdlp(["--flat-playlist", "--dump-json", "--no-warnings", channel_url], timeout=90)
    
    entries = []
    total = 0
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        try:
            e = json.loads(line)
            entries.append(e)
            total += 1
        except json.JSONDecodeError:
            continue

    start = (page - 1) * limit
    page_entries = entries[start : start + limit]

    videos = []
    for e in page_entries:
        videos.append({
            "id": e.get("id"),
            "title": e.get("title"),
            "durationSeconds": round(e["duration"]) if e.get("duration") else None,
            "thumbnailUrl": best_thumbnail(e.get("thumbnails")) or e.get("thumbnail"),
            "publishedAt": e.get("upload_date"),
        })

    channel_title = "Unknown"
    subscriber_count = None
    description = None
    verified = False
    thumbnail = None

    if entries:
        first = entries[0]
        channel_title = first.get("channel") or first.get("uploader") or "Unknown"
        subscriber_count = first.get("channel_follower_count")
        verified = first.get("channel_is_verified", False)
        thumbnail = best_thumbnail(first.get("thumbnails"))

    if not subscriber_count:
        try:
            meta_out = run_ytdlp(["--dump-single-json", "--playlist-items", "1", "--no-warnings",
                                  f"https://www.youtube.com/channel/{channel_id}/videos"], timeout=30)
            meta = json.loads(meta_out)
            channel_title = meta.get("uploader") or meta.get("channel") or channel_title
            subscriber_count = meta.get("channel_follower_count") or subscriber_count
            description = meta.get("description")
            verified = meta.get("channel_is_verified", False) or verified
            if not thumbnail:
                thumbnail = best_thumbnail(meta.get("thumbnails"))
        except Exception:
            pass

    return {
        "channel": {
            "id": channel_id,
            "title": channel_title,
            "thumbnailUrl": thumbnail,
            "bannerUrl": None,
            "handle": entries[0].get("uploader_id") if entries else None,
            "subscriberCount": subscriber_count,
            "description": description,
            "verified": verified,
        },
        "videos": videos,
        "availableTabs": ["videos"],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "hasMore": start + limit < total,
        },
    }


# ─── Download History ─────────────────────────────────────────────────────────

@app.get("/api/videos/downloaded")
@app.get("/downloaded")
def get_downloaded(ids: str = Query(...)):
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return {"downloaded": {}}

    result = history_table.scan(
        FilterExpression="video_id IN :ids",
        ExpressionAttributeValues={":ids": id_list},
    )
    downloaded = {}
    for item in result.get("Items", []):
        vid = item["video_id"]
        if vid not in downloaded:
            downloaded[vid] = {
                "kind": item["kind"],
                "downloadedAt": item["downloaded_at"],
            }
    return {"downloaded": downloaded}


# ─── Batch Management ─────────────────────────────────────────────────────────

class VideoEntry(BaseModel):
    id: str
    title: str
    channelId: str
    channelTitle: str | None = None
    kind: str | None = None
    imageUrl: str | None = None
    imageType: str | None = None

class BatchConfig(BaseModel):
    kind: str
    quality: str
    includeThumbnail: bool | None = False
    includeMetadata: bool | None = False

class CreateBatchRequest(BaseModel):
    videos: list[VideoEntry]
    config: BatchConfig


@app.post("/api/batches")
def create_batch(req: CreateBatchRequest):
    if not req.videos:
        raise HTTPException(400, "Select at least one video to download")
    if req.config.kind not in ("video", "audio"):
        raise HTTPException(400, "Choose a format and quality before downloading")

    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    ttl = int(time.time()) + 30 * 86400

    # Write batch record
    batches_table.put_item(Item={
        "id": batch_id,
        "status": "pending",
        "totalJobs": len(req.videos),
        "completedJobs": 0,
        "createdAt": now,
        "expiresAt": ttl,
    })

    # Write job records with metadata inline (fixes "Unknown video" bug)
    job_entries = []
    for video in req.videos:
        job_id = str(uuid.uuid4())
        kind = "image" if video.kind == "image" else req.config.kind
        quality = (
            json.dumps({
                "url": video.imageUrl,
                "type": video.imageType,
                "channelTitle": video.channelTitle or "Unknown Channel",
            })
            if video.kind == "image"
            else req.config.quality
        )

        jobs_table.put_item(Item={
            "id": job_id,
            "batchId": batch_id,
            "videoId": None if video.kind == "image" else video.id,
            "videoTitle": video.title,
            "videoThumbnail": None,
            "kind": kind,
            "quality": quality,
            "includeThumbnail": False if video.kind == "image" else (req.config.includeThumbnail or False),
            "includeMetadata": False if video.kind == "image" else (req.config.includeMetadata or False),
            "status": "pending",
            "progressPct": 0,
            "outputPath": None,
            "s3Key": None,
            "error": None,
            "createdAt": now,
            "finishedAt": None,
            "expiresAt": ttl,
        })

        job_entries.append({"jobId": job_id, "batchId": batch_id})

    # Enqueue to SQS
    for entry in job_entries:
        sqs.send_message(
            QueueUrl=DOWNLOAD_QUEUE,
            MessageBody=json.dumps(entry),
        )

    return {"batchId": batch_id, "totalJobs": len(req.videos)}


@app.get("/api/batches/active")
def get_active_batches():
    # Get active (pending/running) batches
    result = batches_table.scan(
        FilterExpression="#status IN (:pending, :running)",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":pending": "pending", ":running": "running"},
    )
    active_batches = result.get("Items", [])

    # Get most recent completed batch
    done_result = batches_table.scan(
        FilterExpression="#status IN (:done, :partial)",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":done": "done", ":partial": "partial"},
    )
    done_batches = done_result.get("Items", [])
    done_batches.sort(key=lambda b: b.get("createdAt", ""), reverse=True)
    recent_done = done_batches[0] if done_batches else None

    enriched = []
    for batch in active_batches:
        enriched.append(_enrich_batch(batch))

    recent_completed = _enrich_batch(recent_done) if recent_done else None

    return {"batches": enriched, "recentCompleted": recent_completed}


@app.get("/api/batches/{batch_id}")
def get_batch(batch_id: str):
    resp = batches_table.get_item(Key={"id": batch_id})
    batch = resp.get("Item")
    if not batch:
        raise HTTPException(404, "Batch not found — it may have been removed")

    jobs_resp = jobs_table.query(
        IndexName="batchId-index",
        KeyConditionExpression=boto3.dynamodb.conditions.Key("batchId").eq(batch_id),
    )
    batch_jobs = jobs_resp.get("Items", [])

    return {
        "batch": {
            "id": batch["id"],
            "status": batch["status"],
            "totalJobs": batch["totalJobs"],
            "completedJobs": batch["completedJobs"],
            "createdAt": batch["createdAt"],
        },
        "jobs": [_format_job(j) for j in batch_jobs],
    }


def _enrich_batch(batch: dict) -> dict:
    """Enrich a batch with its jobs (including video metadata)."""
    jobs_resp = jobs_table.query(
        IndexName="batchId-index",
        KeyConditionExpression=boto3.dynamodb.conditions.Key("batchId").eq(batch["id"]),
    )
    batch_jobs = jobs_resp.get("Items", [])

    return {
        "batch": {
            "id": batch["id"],
            "status": batch["status"],
            "totalJobs": batch["totalJobs"],
            "completedJobs": batch["completedJobs"],
            "createdAt": batch["createdAt"],
        },
        "jobs": [_format_job(j) for j in batch_jobs],
    }


def _format_job(job: dict) -> dict:
    """Format a job for API response, using stored metadata."""
    return {
        "id": job["id"],
        "videoId": job.get("videoId"),
        "videoTitle": job.get("videoTitle", "Unknown video"),
        "videoThumbnail": job.get("videoThumbnail"),
        "kind": job["kind"],
        "quality": job.get("quality"),
        "status": job["status"],
        "progressPct": job.get("progressPct", 0),
        "error": job.get("error"),
    }


@app.get("/api/batches/{batch_id}/download")
def download_job(batch_id: str, jobId: str = Query(...)):
    resp = jobs_table.get_item(Key={"id": jobId})
    job = resp.get("Item")
    if not job:
        raise HTTPException(404, "Job not found")
    if job["batchId"] != batch_id:
        raise HTTPException(400, "Job does not belong to this batch")
    if job["status"] != "done":
        raise HTTPException(400, "Job is not complete yet")
    if not job.get("s3Key"):
        raise HTTPException(404, "Download URL not available")

    filename = job["s3Key"].rsplit("/", 1)[-1]
    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": OUTPUTS_BUCKET,
            "Key": job["s3Key"],
            "ResponseContentDisposition": f'attachment; filename="{filename}"',
        },
        ExpiresIn=900,
    )

    return {
        "url": url,
        "expiresIn": 900,
        "filename": filename,
        "kind": job["kind"],
    }


# ─── Mangum adapter for Lambda ───────────────────────────────────────────────

from mangum import Mangum

lambda_handler = Mangum(app, lifespan="off")
