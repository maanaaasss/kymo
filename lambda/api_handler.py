"""
FastAPI backend for Kymo — handles yt-dlp operations.

Deployed as a Lambda behind API Gateway. Vercel frontend proxies
metadata/browse requests here via proxyIfRemote(BACKEND_URL).
"""

import json
import os
import re
import subprocess
import tempfile
from typing import Optional

import boto3
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── AWS ──────────────────────────────────────────────────────────────────────

REGION = os.environ.get("KYMO_REGION", "ap-south-2")
HISTORY_TABLE = os.environ.get("DYNAMODB_DOWNLOAD_HISTORY_TABLE", "kymo-download-history")
DOWNLOAD_QUEUE = os.environ.get("SQS_DOWNLOAD_QUEUE", "")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
sqs = boto3.client("sqs", region_name=REGION)
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


# ─── Routes ───────────────────────────────────────────────────────────────────

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

    # Cache download history for this channel
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

    # Get channel metadata from first entry or fetch separately
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

    # Fetch channel metadata if not in flat output
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


@app.post("/download")
class DownloadRequest(BaseModel):
    videoId: str
    format: str = "video"
    quality: str = "highest"
    includeThumbnail: bool = True
    includeMetadata: bool = False

def trigger_download(req: DownloadRequest):
    if not DOWNLOAD_QUEUE:
        raise HTTPException(500, "SQS queue not configured")

    job = {
        "videoId": req.videoId,
        "kind": req.format,
        "quality": req.quality,
        "includeThumbnail": req.includeThumbnail,
        "includeMetadata": req.includeMetadata,
    }
    sqs.send_message(QueueUrl=DOWNLOAD_QUEUE, MessageBody=json.dumps(job))
    return {"status": "queued", "job": job}


# ─── Mangum adapter for Lambda ───────────────────────────────────────────────

from mangum import Mangum

lambda_handler = Mangum(app, lifespan="off")
