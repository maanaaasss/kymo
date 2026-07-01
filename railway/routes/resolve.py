import json

from fastapi import APIRouter
from pydantic import BaseModel

from ytdlp import run_ytdlp, detect_url_type, YtdlpError

router = APIRouter()


class ResolveRequest(BaseModel):
    url: str


@router.post("/api/resolve-url")
def resolve_url(req: ResolveRequest):
    url = req.url.strip()
    url_type = detect_url_type(url)
    if url_type == "unknown":
        raise YtdlpError("That doesn't look like a YouTube URL", 422)

    channel_url = url
    if url_type == "channel" and not url.endswith("/videos"):
        channel_url = url.rstrip("/") + "/videos"

    try:
        output = run_ytdlp(
            ["--dump-single-json", "--playlist-items", "1", "--no-warnings", channel_url]
        )
    except YtdlpError:
        raise
    except Exception as e:
        raise YtdlpError(str(e)[:500])

    data = json.loads(output)
    is_playlist = data.get("_type") == "playlist"
    first = (data.get("entries") or [{}])[0] if is_playlist else data

    if not first.get("channel_id"):
        raise YtdlpError("Couldn't determine the channel for this URL", 422)

    channel_id = first["channel_id"]
    channel_title = first.get("channel") or first.get("uploader") or "Unknown"

    avatar = banner = None
    try:
        ch_output = run_ytdlp([
            "--dump-single-json", "--playlist-items", "1", "--no-warnings",
            f"https://www.youtube.com/channel/{channel_id}/videos",
        ])
        ch_data = json.loads(ch_output)
        for t in ch_data.get("thumbnails", []):
            if t.get("id") == "avatar" or (t.get("height", 0) >= 100 and "avatar" in t.get("url", "")):
                avatar = t.get("url")
            if t.get("id") == "banner" or (t.get("height", 0) >= 200 and "banner" in t.get("url", "")):
                banner = t.get("url")
    except Exception:
        pass

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
