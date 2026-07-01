"""
SQLite database for batches, jobs, and download history.
Single file, zero config, no IAM roles, no connection strings.
"""

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path("/tmp/kymo/kymo.db")


def _ensure_dir():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_db():
    _ensure_dir()
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'pending',
                total_jobs INTEGER NOT NULL DEFAULT 0,
                completed_jobs INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                video_id TEXT,
                video_title TEXT NOT NULL DEFAULT 'Unknown video',
                video_thumbnail TEXT,
                kind TEXT NOT NULL,
                quality TEXT,
                include_thumbnail INTEGER DEFAULT 0,
                include_metadata INTEGER DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                progress_pct REAL DEFAULT 0,
                output_path TEXT,
                error TEXT,
                created_at TEXT NOT NULL,
                finished_at TEXT,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (batch_id) REFERENCES batches(id)
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id);

            CREATE TABLE IF NOT EXISTS download_history (
                video_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                downloaded_at TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
        """)


# ─── Batch Operations ───────────────────────────────────────────────────────

def create_batch(batch_id: str, total_jobs: int, created_at: str, expires_at: int):
    with get_db() as db:
        db.execute(
            "INSERT INTO batches (id, status, total_jobs, completed_jobs, created_at, expires_at) VALUES (?, 'pending', ?, 0, ?, ?)",
            (batch_id, total_jobs, created_at, expires_at),
        )


def create_job(job: dict):
    with get_db() as db:
        db.execute(
            """INSERT INTO jobs (id, batch_id, video_id, video_title, video_thumbnail, kind, quality,
               include_thumbnail, include_metadata, status, progress_pct, output_path, error, created_at, finished_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, NULL, ?)""",
            (job["id"], job["batch_id"], job.get("video_id"), job.get("video_title", "Unknown video"),
             job.get("video_thumbnail"), job["kind"], job.get("quality"),
             1 if job.get("include_thumbnail") else 0, 1 if job.get("include_metadata") else 0,
             job["created_at"], job["expires_at"]),
        )


def get_active_batches() -> list[dict]:
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM batches WHERE status IN ('pending', 'running') ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_recent_completed_batch() -> dict | None:
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM batches WHERE status IN ('done', 'partial') ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None


def get_batch(batch_id: str) -> dict | None:
    with get_db() as db:
        row = db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)).fetchone()
        return dict(row) if row else None


def get_jobs_for_batch(batch_id: str) -> list[dict]:
    with get_db() as db:
        rows = db.execute("SELECT * FROM jobs WHERE batch_id = ?", (batch_id,)).fetchall()
        return [dict(r) for r in rows]


def claim_job(job_id: str) -> bool:
    with get_db() as db:
        cur = db.execute(
            "UPDATE jobs SET status = 'running' WHERE id = ? AND status = 'pending'",
            (job_id,),
        )
        return cur.rowcount > 0


def get_job(job_id: str) -> dict | None:
    with get_db() as db:
        row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None


def update_job_status(job_id: str, status: str, **kwargs):
    sets = ["status = ?"]
    vals = [status]
    for k, v in kwargs.items():
        col = k  # already snake_case
        sets.append(f"{col} = ?")
        vals.append(v)
    vals.append(job_id)
    with get_db() as db:
        db.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id = ?", vals)


def update_job_progress(job_id: str, pct: float):
    with get_db() as db:
        db.execute("UPDATE jobs SET progress_pct = ? WHERE id = ?", (pct, job_id))


def increment_batch_completed(batch_id: str):
    with get_db() as db:
        db.execute(
            "UPDATE batches SET completed_jobs = completed_jobs + 1 WHERE id = ?",
            (batch_id,),
        )


def check_batch_completion(batch_id: str):
    jobs = get_jobs_for_batch(batch_id)
    if not jobs:
        return
    all_done = all(j["status"] == "done" for j in jobs)
    any_failed = any(j["status"] == "failed" for j in jobs)
    all_finished = all(j["status"] in ("done", "failed") for j in jobs)

    with get_db() as db:
        if all_done:
            db.execute(
                "UPDATE batches SET status = 'done', completed_jobs = ? WHERE id = ?",
                (len(jobs), batch_id),
            )
        elif all_finished and any_failed:
            done_count = sum(1 for j in jobs if j["status"] == "done")
            db.execute(
                "UPDATE batches SET status = 'partial', completed_jobs = ? WHERE id = ?",
                (done_count, batch_id),
            )


def create_download_history(video_id: str, kind: str):
    expires_at = int(time.time()) + 30 * 86400
    with get_db() as db:
        db.execute(
            "INSERT OR REPLACE INTO download_history (video_id, kind, downloaded_at, expires_at) VALUES (?, ?, datetime('now'), ?)",
            (video_id, kind, expires_at),
        )


def get_downloaded(video_ids: list[str]) -> dict:
    if not video_ids:
        return {}
    with get_db() as db:
        placeholders = ",".join("?" for _ in video_ids)
        rows = db.execute(
            f"SELECT * FROM download_history WHERE video_id IN ({placeholders})",
            video_ids,
        ).fetchall()
    result = {}
    for r in rows:
        result[r["video_id"]] = {"kind": r["kind"], "downloadedAt": r["downloaded_at"]}
    return result
