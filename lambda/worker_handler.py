"""
Lambda worker handler for processing download jobs.

Entry point for SQS-triggered Lambda invocations.
Each invocation processes a single job: download via yt-dlp,
upload to S3, and update job status in DynamoDB.
"""

import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

# ─── AWS Clients ─────────────────────────────────────────────────────────────

REGION = os.environ.get("KYMO_REGION", "ap-south-2")
JOBS_TABLE = os.environ.get("DYNAMODB_JOBS_TABLE", "kymo-jobs")
BATCHES_TABLE = os.environ.get("DYNAMODB_BATCHES_TABLE", "kymo-batches")
HISTORY_TABLE = os.environ.get("DYNAMODB_DOWNLOAD_HISTORY_TABLE", "kymo-download-history")
OUTPUTS_BUCKET = os.environ.get("S3_OUTPUTS_BUCKET", "kymo-outputs")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3_client = boto3.client("s3", region_name=REGION)

jobs_table = dynamodb.Table(JOBS_TABLE)
batches_table = dynamodb.Table(BATCHES_TABLE)
history_table = dynamodb.Table(HISTORY_TABLE)

DOWNLOADS_ROOT = "/tmp/kymo"
MAX_RETRIES = 2
RETRY_BASE_DELAY_MS = 5000
PROGRESS_THROTTLE_MS = 3000

VIDEO_EXTENSIONS = ["mp4", "mkv", "webm"]
AUDIO_EXTENSIONS = ["mp3", "m4a", "opus", "ogg"]
IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"]

RETRYABLE_PATTERNS = [
    re.compile(r"HTTP Error 5\d{2}"),
    re.compile(r"HTTP Error 429"),
    re.compile(r"timed?\s*out", re.I),
    re.compile(r"ECONNRESET", re.I),
    re.compile(r"ECONNREFUSED", re.I),
    re.compile(r"ETIMEDOUT", re.I),
    re.compile(r"ENOTFOUND", re.I),
    re.compile(r"socket hang up", re.I),
    re.compile(r"temporary failure", re.I),
    re.compile(r"network is unreachable", re.I),
    re.compile(r"connection reset by peer", re.I),
    re.compile(r"Unable to download", re.I),
]

PERMANENT_ERROR_PATTERNS = [
    re.compile(r"Private video", re.I),
    re.compile(r"Sign in", re.I),
    re.compile(r"HTTP Error 404"),
    re.compile(r"does not exist", re.I),
    re.compile(r"is not a valid URL", re.I),
    re.compile(r"This video is unavailable", re.I),
    re.compile(r"This video has been removed", re.I),
    re.compile(r"Video unavailable", re.I),
]


# ─── SQS Handler ─────────────────────────────────────────────────────────────

def handler(event, context):
    """Main Lambda handler invoked by SQS."""
    batch_item_failures = []

    for record in event.get("Records", []):
        try:
            message = json.loads(record["body"])
            job_id = message.get("jobId")

            if not job_id:
                print(f"[Lambda] No jobId in message: {record['body']}")
                continue

            print(f"[Lambda] Processing job {job_id}")
            process_job(job_id)
            print(f"[Lambda] Job {job_id} completed successfully")
        except Exception as e:
            print(f"[Lambda] Failed to process job: {e}")
            batch_item_failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": batch_item_failures}


# ─── Job Processing ──────────────────────────────────────────────────────────

def process_job(job_id: str):
    """Process a single download job."""
    if not claim_job(job_id):
        print(f"[Lambda] Job {job_id} already claimed — skipping")
        return

    job = get_job(job_id)
    if not job:
        raise Exception(f"Job {job_id} not found in DynamoDB")

    if not job.get("batchId") or not job.get("videoId"):
        raise Exception(f"Job {job_id} is missing batchId or videoId")

    download_with_retry(job_id, job["batchId"], job["videoId"])


def download_with_retry(job_id: str, batch_id: str, video_id: str):
    """Download with automatic retry for transient errors."""
    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            delay = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1))
            print(f"[Lambda] Retrying job {job_id} (attempt {attempt + 1}) after {delay}ms")
            time.sleep(delay / 1000)
            update_job_progress(job_id, 0)

        try:
            job = get_job(job_id)
            if not job:
                raise Exception("Job not found")

            if job.get("kind") == "image":
                process_image_job(job)
                return

            output_dir = os.path.join(DOWNLOADS_ROOT, sanitize_filename(job["id"]))
            os.makedirs(output_dir, exist_ok=True)

            output_template = os.path.join(output_dir, "output")

            args = build_ytdlp_args(
                kind=job["kind"],
                quality=job.get("quality"),
                include_thumbnail=job.get("includeThumbnail", False),
                include_metadata=job.get("includeMetadata", False),
                output_path=output_template,
            )
            args.append(f"https://www.youtube.com/watch?v={video_id}")

            print(f"[Lambda] Processing job {job['id']}: yt-dlp started")
            run_ytdlp(args, job_id)

            actual_output = find_output_file(output_dir)
            filename = os.path.basename(actual_output) if actual_output else os.path.basename(output_template)
            s3_key = f"outputs/{batch_id}/{job_id}/{filename}"

            if actual_output:
                upload_to_s3(actual_output, s3_key)

            update_job_status(job_id, "done", {
                "progressPct": 100,
                "outputPath": actual_output or output_template,
                "s3Key": s3_key,
                "finishedAt": datetime.now(timezone.utc).isoformat(),
            })

            create_download_history(video_id, job["kind"])
            increment_batch_completed_jobs(batch_id)
            check_batch_completion(batch_id)
            cleanup_dir(output_dir)

            print(f"[Lambda] Job {job_id} completed")
            return

        except Exception as e:
            error_msg = str(e)
            if is_retryable(error_msg) and attempt < MAX_RETRIES:
                print(f"[Lambda] Job {job_id} retryable error: {error_msg}")
                cleanup_dir(os.path.join(DOWNLOADS_ROOT, sanitize_filename(job_id)))
                continue

            print(f"[Lambda] Job {job_id} failed permanently: {error_msg}")
            update_job_status(job_id, "failed", {
                "error": error_msg[:500],
                "finishedAt": datetime.now(timezone.utc).isoformat(),
            })
            check_batch_completion(batch_id)
            return


def process_image_job(job: dict):
    """Process an image download job."""
    batch_id = job["batchId"]
    meta = json.loads(job.get("quality") or "{}")
    image_url = meta.get("url")
    image_type = meta.get("type", "avatar")
    channel_title = meta.get("channelTitle", "Unknown Channel")

    output_dir = os.path.join(DOWNLOADS_ROOT, sanitize_filename(job["id"]))
    os.makedirs(output_dir, exist_ok=True)

    ext = get_url_extension(image_url)
    filename = f"{sanitize_filename(channel_title)}_{image_type}.{ext}"
    local_path = os.path.join(output_dir, filename)

    download_file(image_url, local_path)

    s3_key = f"outputs/{batch_id}/{job['id']}/{filename}"
    upload_to_s3(local_path, s3_key)

    update_job_status(job["id"], "done", {
        "progressPct": 100,
        "outputPath": local_path,
        "s3Key": s3_key,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
    })

    increment_batch_completed_jobs(batch_id)
    check_batch_completion(batch_id)
    cleanup_dir(output_dir)


# ─── yt-dlp Execution ───────────────────────────────────────────────────────

def run_ytdlp(args: list[str], job_id: str):
    """Run yt-dlp with progress tracking."""
    env = os.environ.copy()
    env["PATH"] = f"/opt/ffmpeg:{env.get('PATH', '/usr/local/bin:/usr/bin:/bin')}"

    proc = subprocess.Popen(
        ["yt-dlp"] + args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
    )

    stderr_lines = []
    last_progress_update = 0

    for line in proc.stdout:
        pct = parse_progress(line)
        if pct is not None:
            now = time.time() * 1000
            if now - last_progress_update >= PROGRESS_THROTTLE_MS:
                try:
                    update_job_progress(job_id, pct)
                except Exception:
                    pass
                last_progress_update = now

    for line in proc.stderr:
        stderr_lines.append(line)

    proc.wait()

    if proc.returncode != 0:
        stderr = "".join(stderr_lines)
        raise Exception(parse_ytdlp_error(stderr))


def build_ytdlp_args(kind: str, quality: str | None, include_thumbnail: bool, include_metadata: bool, output_path: str) -> list[str]:
    """Build yt-dlp CLI arguments."""
    args = ["--no-warnings", "--newline"]
    args.extend(["--progress-template", "download:%(progress._percent_str)s"])
    args.extend(["-c", "-o", output_path])

    if kind == "audio":
        args.extend(["--extract-audio", "--audio-format", quality or "mp3", "--audio-quality", "0"])
    else:
        args.extend(["-f", video_format_selector(quality)])

    if include_thumbnail:
        args.extend(["--write-thumbnail", "--convert-thumbnails", "jpg"])
    if include_metadata:
        args.append("--write-info-json")

    return args


def video_format_selector(quality: str | None) -> str:
    selectors = {
        "1080p": 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b',
        "720p": 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
        "480p": 'bv*[height<=480]+ba/b[height<=480]/bv*+ba/b',
    }
    return selectors.get(quality, 'bv*+ba/b')


def parse_progress(line: str) -> float | None:
    m = re.search(r"download:\s*([\d.]+)%", line)
    if m:
        return float(m.group(1))
    m = re.search(r"\[download\]\s+([\d.]+)%", line)
    if m:
        return float(m.group(1))
    return None


def parse_ytdlp_error(stderr: str) -> str:
    if "Private video" in stderr or "Sign in" in stderr:
        return "This video is private or age-restricted"
    if "HTTP Error 404" in stderr or "does not exist" in stderr:
        return "This video was deleted or doesn't exist"
    if "HTTP Error 429" in stderr:
        return "YouTube is rate-limiting requests — try again later"
    if "is not a valid URL" in stderr:
        return "Invalid video URL"
    lines = stderr.strip().split("\n")
    last = lines[-1] if lines else "Unknown error"
    return last[:200]


def is_retryable(error_msg: str) -> bool:
    for p in PERMANENT_ERROR_PATTERNS:
        if p.search(error_msg):
            return False
    for p in RETRYABLE_PATTERNS:
        if p.search(error_msg):
            return True
    return False


# ─── DynamoDB Operations ─────────────────────────────────────────────────────

def claim_job(job_id: str) -> bool:
    try:
        jobs_table.update_item(
            Key={"id": job_id},
            UpdateExpression="SET #status = :claimed",
            ConditionExpression="#status = :pending",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":claimed": "running",
                ":pending": "pending",
            },
        )
        return True
    except ClientError:
        return False


def get_job(job_id: str) -> dict | None:
    resp = jobs_table.get_item(Key={"id": job_id})
    return resp.get("Item")


def update_job_status(job_id: str, status: str, updates: dict | None = None):
    expr = "SET #status = :status"
    names = {"#status": "status"}
    vals = {":status": status}

    if updates:
        for k, v in updates.items():
            if k == "error":
                expr += ", #err = :error"
                names["#err"] = "error"
                vals[":error"] = v
            else:
                expr += f", {k} = :{k}"
                vals[f":{k}"] = v

    jobs_table.update_item(
        Key={"id": job_id},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=vals,
    )


def update_job_progress(job_id: str, pct: float):
    jobs_table.update_item(
        Key={"id": job_id},
        UpdateExpression="SET progressPct = :p",
        ExpressionAttributeValues={":p": pct},
    )


def get_jobs_by_batch(batch_id: str) -> list[dict]:
    resp = jobs_table.query(
        IndexName="batchId-index",
        KeyConditionExpression=boto3.dynamodb.conditions.Key("batchId").eq(batch_id),
    )
    return resp.get("Items", [])


def increment_batch_completed_jobs(batch_id: str):
    batches_table.update_item(
        Key={"id": batch_id},
        UpdateExpression="ADD completedJobs :inc",
        ExpressionAttributeValues={":inc": 1},
    )


def check_batch_completion(batch_id: str):
    jobs = get_jobs_by_batch(batch_id)
    all_done = all(j["status"] == "done" for j in jobs)
    any_failed = any(j["status"] == "failed" for j in jobs)
    all_finished = all(j["status"] in ("done", "failed") for j in jobs)

    if all_done:
        batches_table.update_item(
            Key={"id": batch_id},
            UpdateExpression="SET #status = :status, completedJobs = :count",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": "done", ":count": len(jobs)},
        )
        print(f"[Lambda] Batch {batch_id} completed")
    elif all_finished and any_failed:
        done_count = sum(1 for j in jobs if j["status"] == "done")
        batches_table.update_item(
            Key={"id": batch_id},
            UpdateExpression="SET #status = :status, completedJobs = :count",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": "partial", ":count": done_count},
        )
        print(f"[Lambda] Batch {batch_id} partially completed")


def create_download_history(video_id: str, kind: str):
    try:
        history_table.put_item(
            Item={
                "videoId": video_id,
                "kind": kind,
                "downloadedAt": datetime.now(timezone.utc).isoformat(),
                "expiresAt": int(time.time()) + 30 * 86400,
            }
        )
    except Exception:
        pass


# ─── S3 Operations ───────────────────────────────────────────────────────────

def upload_to_s3(local_path: str, s3_key: str):
    s3_client.upload_file(local_path, OUTPUTS_BUCKET, s3_key)


# ─── File Helpers ────────────────────────────────────────────────────────────

def find_output_file(directory: str) -> str | None:
    try:
        files = os.listdir(directory)
        for ext in VIDEO_EXTENSIONS + AUDIO_EXTENSIONS:
            match = next((f for f in files if f.endswith(f".{ext}")), None)
            if match:
                return os.path.join(directory, match)
        return os.path.join(directory, files[0]) if files else None
    except Exception:
        return None


def download_file(url: str, dest_path: str):
    import urllib.request
    urllib.request.urlretrieve(url, dest_path)


def cleanup_dir(directory: str):
    try:
        import shutil
        if os.path.exists(directory):
            shutil.rmtree(directory, ignore_errors=True)
    except Exception:
        pass


def get_url_extension(url: str) -> str:
    try:
        parsed = urlparse(url)
        parts = parsed.path.split(".")
        if len(parts) > 1:
            ext = parts[-1].lower()
            if ext in IMAGE_EXTENSIONS:
                return "jpg" if ext == "jpeg" else ext
        return "jpg"
    except Exception:
        return "jpg"


def sanitize_filename(name: str) -> str:
    result = re.sub(r"[\x00-\x1F\x7F]", "", name)
    result = re.sub(r"[\u200B-\u200F\uFEFF]", "", result)
    result = re.sub(r'[\/\\:*?"<>|]', "_", result)
    result = re.sub(r"_{2,}", "_", result)
    result = result.strip(". ")
    result = result[:200] or "untitled"
    return result
