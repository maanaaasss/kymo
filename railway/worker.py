"""
Background download worker.
Uses asyncio.Queue instead of SQS — processes jobs in the same process.
"""

import asyncio
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from db import (
    check_batch_completion,
    create_download_history,
    get_job,
    increment_batch_completed,
    update_job_progress,
    update_job_status,
)
from ytdlp import run_ytdlp, YtdlpError

DOWNLOADS_ROOT = Path("/tmp/kymo/downloads")
MAX_RETRIES = 2
RETRY_BASE_DELAY = 5

VIDEO_EXTENSIONS = ["mp4", "mkv", "webm"]
AUDIO_EXTENSIONS = ["mp3", "m4a", "opus", "ogg"]

RETRYABLE_PATTERNS = [
    re.compile(r"HTTP Error 5\d{2}"),
    re.compile(r"HTTP Error 429"),
    re.compile(r"timed?\s*out", re.I),
    re.compile(r"ECONNRESET", re.I),
    re.compile(r"ETIMEDOUT", re.I),
    re.compile(r"socket hang up", re.I),
    re.compile(r"temporary failure", re.I),
    re.compile(r"network is unreachable", re.I),
    re.compile(r"connection reset by peer", re.I),
    re.compile(r"Unable to download", re.I),
]

PERMANENT_PATTERNS = [
    re.compile(r"Private video", re.I),
    re.compile(r"HTTP Error 404"),
    re.compile(r"does not exist", re.I),
    re.compile(r"is not a valid URL", re.I),
    re.compile(r"This video is unavailable", re.I),
    re.compile(r"This video has been removed", re.I),
    re.compile(r"Video unavailable", re.I),
]

# Global queue accessed by routes and worker
download_queue: asyncio.Queue[str] = asyncio.Queue()


def enqueue_job(job_id: str):
    download_queue.put_nowait(job_id)


def _is_retryable(error_msg: str) -> bool:
    for p in PERMANENT_PATTERNS:
        if p.search(error_msg):
            return False
    for p in RETRYABLE_PATTERNS:
        if p.search(error_msg):
            return True
    return False


def _sanitize(name: str) -> str:
    result = re.sub(r"[\x00-\x1F\x7F\u200B-\u200F\uFEFF]", "", name)
    result = re.sub(r'[\/\\:*?"<>|]', "_", result)
    result = re.sub(r"_{2,}", "_", result)
    result = result.strip(". ")
    return result[:200] or "untitled"


def _find_output(directory: str) -> str | None:
    try:
        files = os.listdir(directory)
        for ext in VIDEO_EXTENSIONS + AUDIO_EXTENSIONS:
            match = next((f for f in files if f.endswith(f".{ext}")), None)
            if match:
                return os.path.join(directory, match)
        return os.path.join(directory, files[0]) if files else None
    except Exception:
        return None


def _build_ytdlp_args(
    kind: str,
    quality: str | None,
    include_thumbnail: bool,
    include_metadata: bool,
    output_path: str,
) -> list[str]:
    args = ["--no-warnings", "--newline", "-c", "-o", output_path]

    if kind == "audio":
        fmt = quality if quality and quality != "best" else "mp3"
        args.extend(["--extract-audio", "--audio-format", fmt, "--audio-quality", "0"])
    else:
        selectors = {
            "1080p": "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
            "720p": "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
            "480p": "bv*[height<=480]+ba/b[height<=480]/bv*+ba/b",
        }
        args.extend(["-f", selectors.get(quality, "bv*+ba/b")])

    if include_thumbnail:
        args.extend(["--write-thumbnail", "--convert-thumbnails", "jpg"])
    if include_metadata:
        args.append("--write-info-json")

    return args


def _process_image_job(job: dict):
    batch_id = job["batch_id"]
    meta = json.loads(job.get("quality") or "{}")
    image_url = meta.get("url")
    image_type = meta.get("type", "avatar")
    channel_title = meta.get("channelTitle", "Unknown Channel")

    output_dir = DOWNLOADS_ROOT / _sanitize(job["id"])
    output_dir.mkdir(parents=True, exist_ok=True)

    ext = "jpg"
    if image_url:
        try:
            parts = image_url.rsplit(".", 1)
            if len(parts) > 1:
                candidate = parts[-1].split("?")[0].lower()
                if candidate in ("jpg", "jpeg", "png", "webp", "gif"):
                    ext = "jpg" if candidate == "jpeg" else candidate
        except Exception:
            pass

    filename = f"{_sanitize(channel_title)}_{image_type}.{ext}"
    local_path = output_dir / filename

    urllib.request.urlretrieve(image_url, str(local_path))

    update_job_status(
        job["id"],
        "done",
        progress_pct=100,
        output_path=str(local_path),
        finished_at=datetime.now(timezone.utc).isoformat(),
    )
    create_download_history(job.get("video_id", ""), job["kind"])
    increment_batch_completed(batch_id)
    check_batch_completion(batch_id)


def _process_video_job(job: dict):
    job_id = job["id"]
    batch_id = job["batch_id"]
    video_id = job["video_id"]

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            print(f"[Worker] Retrying job {job_id} (attempt {attempt + 1}) after {delay}s")
            time.sleep(delay)
            update_job_progress(job_id, 0)

        job = get_job(job_id)
        if not job:
            print(f"[Worker] Job {job_id} not found, skipping")
            return

        try:
            output_dir = DOWNLOADS_ROOT / _sanitize(job_id)
            output_dir.mkdir(parents=True, exist_ok=True)
            output_template = str(output_dir / "output")

            args = _build_ytdlp_args(
                kind=job["kind"],
                quality=job.get("quality"),
                include_thumbnail=bool(job.get("include_thumbnail")),
                include_metadata=bool(job.get("include_metadata")),
                output_path=output_template,
            )
            args.append(f"https://www.youtube.com/watch?v={video_id}")

            run_ytdlp(args, timeout=300)

            actual_output = _find_output(str(output_dir))
            filename = os.path.basename(actual_output) if actual_output else os.path.basename(output_template)

            update_job_status(
                job_id,
                "done",
                progress_pct=100,
                output_path=actual_output or output_template,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            create_download_history(video_id, job["kind"])
            increment_batch_completed(batch_id)
            check_batch_completion(batch_id)
            print(f"[Worker] Job {job_id} completed")
            return

        except Exception as e:
            error_msg = str(e)
            if _is_retryable(error_msg) and attempt < MAX_RETRIES:
                print(f"[Worker] Job {job_id} retryable: {error_msg}")
                shutil.rmtree(DOWNLOADS_ROOT / _sanitize(job_id), ignore_errors=True)
                continue

            print(f"[Worker] Job {job_id} failed permanently: {error_msg}")
            update_job_status(
                job_id,
                "failed",
                error=error_msg[:500],
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            check_batch_completion(batch_id)
            return


async def process_job(job_id: str):
    """Process a single download job."""
    job = get_job(job_id)
    if not job:
        print(f"[Worker] Job {job_id} not found")
        return

    if not job.get("video_id"):
        print(f"[Worker] Job {job_id} has no video_id, skipping")
        return

    if job.get("kind") == "image":
        try:
            _process_image_job(job)
        except Exception as e:
            print(f"[Worker] Image job {job_id} failed: {e}")
            update_job_status(job_id, "failed", error=str(e)[:500], finished_at=datetime.now(timezone.utc).isoformat())
            check_batch_completion(job["batch_id"])
    else:
        await asyncio.get_event_loop().run_in_executor(None, _process_video_job, job)


async def worker_loop():
    """Background task that processes the download queue."""
    print("[Worker] Download worker started")
    while True:
        job_id = await download_queue.get()
        try:
            print(f"[Worker] Processing job {job_id}")
            await process_job(job_id)
        except Exception as e:
            print(f"[Worker] Unexpected error processing {job_id}: {e}")
        finally:
            download_queue.task_done()
