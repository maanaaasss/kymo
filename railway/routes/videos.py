import json

from fastapi import APIRouter, HTTPException, Query

from db import get_downloaded
from ytdlp import run_ytdlp, YtdlpError

router = APIRouter()


@router.get("/api/videos/{video_id}")
def get_video(video_id: str):
    try:
        output = run_ytdlp([
            "--dump-json", "--no-warnings", "--no-playlist",
            f"https://www.youtube.com/watch?v={video_id}",
        ])
    except YtdlpError:
        raise
    except Exception as e:
        raise YtdlpError(str(e)[:500])

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


@router.get("/api/videos/downloaded")
def get_downloaded_videos(ids: str = Query(...)):
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        return {"downloaded": {}}
    return {"downloaded": get_downloaded(id_list)}
