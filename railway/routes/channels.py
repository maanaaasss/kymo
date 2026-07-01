import json

from fastapi import APIRouter

from ytdlp import run_ytdlp, best_thumbnail, YtdlpError

router = APIRouter()


@router.get("/api/channels/{channel_id}")
def get_channel(channel_id: str, page: int = 1, limit: int = 30, tab: str = "videos"):
    channel_url = f"https://www.youtube.com/channel/{channel_id}/{tab}"

    try:
        output = run_ytdlp(
            ["--flat-playlist", "--dump-json", "--no-warnings", channel_url],
            timeout=90,
        )
    except YtdlpError:
        raise
    except Exception as e:
        raise YtdlpError(str(e)[:500])

    entries = []
    total = 0
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
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
            meta_out = run_ytdlp([
                "--dump-single-json", "--playlist-items", "1", "--no-warnings",
                f"https://www.youtube.com/channel/{channel_id}/videos",
            ], timeout=30)
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
