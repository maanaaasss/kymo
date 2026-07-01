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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    worker_task = asyncio.create_task(worker_loop())
    print("[Startup] Database initialized, worker started")
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    print("[Shutdown] Worker stopped")


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
