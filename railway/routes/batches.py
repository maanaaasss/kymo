import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import (
    create_batch,
    create_job,
    get_active_batches,
    get_batch,
    get_jobs_for_batch,
    get_recent_completed_batch,
)
from worker import enqueue_job

router = APIRouter()


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


def _format_job(job: dict) -> dict:
    return {
        "id": job["id"],
        "videoId": job.get("video_id"),
        "videoTitle": job.get("video_title", "Unknown video"),
        "videoThumbnail": job.get("video_thumbnail"),
        "kind": job["kind"],
        "quality": job.get("quality"),
        "status": job["status"],
        "progressPct": job.get("progress_pct", 0),
        "error": job.get("error"),
    }


def _enrich_batch(batch: dict) -> dict:
    jobs = get_jobs_for_batch(batch["id"])
    return {
        "batch": {
            "id": batch["id"],
            "status": batch["status"],
            "totalJobs": batch["total_jobs"],
            "completedJobs": batch["completed_jobs"],
            "createdAt": batch["created_at"],
        },
        "jobs": [_format_job(j) for j in jobs],
    }


@router.post("/api/batches")
def create_batch_endpoint(req: CreateBatchRequest):
    if not req.videos:
        raise HTTPException(400, "Select at least one video to download")
    if req.config.kind not in ("video", "audio"):
        raise HTTPException(400, "Choose a format and quality before downloading")

    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    ttl = int(time.time()) + 30 * 86400

    create_batch(batch_id, len(req.videos), now, ttl)

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

        create_job({
            "id": job_id,
            "batch_id": batch_id,
            "video_id": None if video.kind == "image" else video.id,
            "video_title": video.title,
            "video_thumbnail": None,
            "kind": kind,
            "quality": quality,
            "include_thumbnail": False if video.kind == "image" else (req.config.includeThumbnail or False),
            "include_metadata": False if video.kind == "image" else (req.config.includeMetadata or False),
            "created_at": now,
            "expires_at": ttl,
        })

        enqueue_job(job_id)

    return {"batchId": batch_id, "totalJobs": len(req.videos)}


@router.get("/api/batches/active")
def get_active_batches_endpoint():
    active = get_active_batches()
    recent_done = get_recent_completed_batch()

    enriched = [_enrich_batch(b) for b in active]
    recent_completed = _enrich_batch(recent_done) if recent_done else None

    return {"batches": enriched, "recentCompleted": recent_completed}


@router.get("/api/batches/{batch_id}")
def get_batch_endpoint(batch_id: str):
    batch = get_batch(batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found — it may have been removed")

    jobs = get_jobs_for_batch(batch_id)
    return {
        "batch": {
            "id": batch["id"],
            "status": batch["status"],
            "totalJobs": batch["total_jobs"],
            "completedJobs": batch["completed_jobs"],
            "createdAt": batch["created_at"],
        },
        "jobs": [_format_job(j) for j in jobs],
    }
