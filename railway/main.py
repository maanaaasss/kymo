"""
Kymo API — single-service FastAPI backend.
No Lambda, no DynamoDB, no SQS, no S3.
SQLite for state, local disk for files, asyncio.Queue for jobs.
"""

import asyncio

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from worker import worker_loop
from routes.health import router as health_router
from routes.resolve import router as resolve_router
from routes.videos import router as videos_router
from routes.channels import router as channels_router
from routes.batches import router as batches_router
from routes.download import router as download_router

FILE_RETENTION_SECONDS = 5 * 60  # 5 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    worker_task = asyncio.create_task(worker_loop())
    cleanup_task = asyncio.create_task(_cleanup_loop())
    print("[Startup] Database initialized, worker + cleanup started")
    yield
    worker_task.cancel()
    cleanup_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    print("[Shutdown] Worker + cleanup stopped")


async def _cleanup_loop():
    """Periodically delete download files older than FILE_RETENTION_SECONDS."""
    import os
    from datetime import datetime, timezone
    from pathlib import Path
    from db import get_db

    downloads_root = Path("/tmp/kymo/downloads")
    while True:
        await asyncio.sleep(60)
        try:
            cutoff = datetime.now(timezone.utc).timestamp() - FILE_RETENTION_SECONDS
            with get_db() as db:
                rows = db.execute(
                    "SELECT id, output_path FROM jobs WHERE status = 'done' AND output_path IS NOT NULL AND finished_at IS NOT NULL"
                ).fetchall()
                for row in rows:
                    try:
                        finished = datetime.fromisoformat(row["finished_at"].replace("Z", "+00:00"))
                        if finished.timestamp() < cutoff:
                            path = Path(row["output_path"])
                            if path.exists():
                                # Delete the file's parent directory (the job output dir)
                                parent = path.parent
                                if parent.exists() and str(parent).startswith(str(downloads_root)):
                                    import shutil
                                    shutil.rmtree(parent, ignore_errors=True)
                                    print(f"[Cleanup] Deleted {parent}")
                            # Clear the output_path so we don't try again
                            with get_db() as cdb:
                                cdb.execute("UPDATE jobs SET output_path = NULL WHERE id = ?", (row["id"],))
                    except Exception as e:
                        print(f"[Cleanup] Error cleaning job {row['id']}: {e}")
        except Exception as e:
            print(f"[Cleanup] Loop error: {e}")


app = FastAPI(title="Kymo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(resolve_router)
app.include_router(videos_router)
app.include_router(channels_router)
app.include_router(batches_router)
app.include_router(download_router)
