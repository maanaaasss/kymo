"""
yt-dlp runner with player-client rotation and bot-detection retry.
"""

import os
import re
import subprocess

PLAYER_CLIENTS = ["android", "ios", "web"]


class YtdlpError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _is_bot_block(stderr: str) -> bool:
    return "Sign in to confirm" in stderr or (
        "bot" in stderr.lower() and "sign in" in stderr.lower()
    )


def _ytdlp_env() -> dict:
    env = os.environ.copy()
    extra = "/usr/local/bin:/usr/bin"
    env["PATH"] = f"{extra}:{env.get('PATH', '')}"
    env["TMPDIR"] = "/tmp"
    env["TEMP"] = "/tmp"
    env["TMP"] = "/tmp"
    return env


def run_ytdlp(args: list[str], timeout: int = 30) -> str:
    """Run yt-dlp and return stdout. Retries with client rotation on bot detection."""
    env = _ytdlp_env()

    has_client_arg = any("player_client" in a for a in args)
    clients_to_try = PLAYER_CLIENTS if not has_client_arg else [None]

    last_stderr = ""
    for client in clients_to_try:
        cmd = ["yt-dlp", "--cache-dir", "/tmp"]
        if client:
            cmd.extend(["--extractor-args", f"youtube:player_client={client}"])
        cmd.extend(args)

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout, env=env
            )
        except FileNotFoundError:
            raise YtdlpError("yt-dlp not installed", 500)
        except subprocess.TimeoutExpired:
            raise YtdlpError("yt-dlp timed out", 504)

        if result.returncode == 0:
            return result.stdout

        last_stderr = result.stderr.strip()
        print(f"[yt-dlp] client={client} STDERR: {last_stderr[:1000]}")

        # Non-retryable — fail immediately
        if "is not a valid URL" in last_stderr or "Unsupported URL" in last_stderr:
            raise YtdlpError("That doesn't look like a YouTube URL", 422)
        if "Private video" in last_stderr:
            raise YtdlpError("This video is private or age-restricted", 422)

        # Bot detection — rotate to next client
        if _is_bot_block(last_stderr) and client != PLAYER_CLIENTS[-1]:
            print(f"[yt-dlp] Bot detected with client={client}, retrying")
            continue

        # Other error or exhausted clients
        if not _is_bot_block(last_stderr) or client == PLAYER_CLIENTS[-1]:
            break

    raise YtdlpError(_parse_error(last_stderr))


def _parse_error(stderr: str) -> str:
    if "Private video" in stderr:
        return "This video is private or age-restricted"
    if _is_bot_block(stderr):
        return "YouTube is blocking automated requests — try again later"
    if "HTTP Error 404" in stderr or "does not exist" in stderr:
        return "This video was deleted or doesn't exist"
    if "HTTP Error 429" in stderr:
        return "YouTube is rate-limiting requests — try again later"
    if "is not a valid URL" in stderr:
        return "Invalid video URL"
    lines = stderr.strip().split("\n")
    last = lines[-1] if lines else "Unknown error"
    return last[:500]


# ─── Helpers ────────────────────────────────────────────────────────────────

def detect_url_type(url: str) -> str:
    if re.search(r"youtube\.com/watch|youtu\.be/", url):
        return "video"
    if re.search(r"youtube\.com/playlist|list=", url):
        return "playlist"
    if re.search(r"youtube\.com/(c/|channel/|@)", url):
        return "channel"
    return "unknown"


def best_thumbnail(thumbnails: list[dict] | None) -> str | None:
    if not thumbnails:
        return None
    best = max(
        thumbnails,
        key=lambda t: (t.get("height", 0) or 0) * (t.get("width", 0) or 0),
    )
    return best.get("url")
