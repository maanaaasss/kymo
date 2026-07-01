import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from db import get_job

router = APIRouter()


@router.get("/api/batches/{batch_id}/download")
def download_job(batch_id: str, jobId: str = Query(...)):
    job = get_job(jobId)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["batch_id"] != batch_id:
        raise HTTPException(400, "Job does not belong to this batch")
    if job["status"] != "done":
        raise HTTPException(400, "Job is not complete yet")
    if not job.get("output_path") or not os.path.exists(job["output_path"]):
        raise HTTPException(404, "Download file not available")

    # Determine filename from the output path
    filename = os.path.basename(job["output_path"])
    if filename.startswith("output."):
        # Give it a better name based on the video title
        title = job.get("video_title", "video")
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
        filename = f"{title[:100]}.{ext}"

    return FileResponse(
        job["output_path"],
        media_type="application/octet-stream",
        filename=filename,
    )
