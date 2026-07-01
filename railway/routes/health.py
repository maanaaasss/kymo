import os
import subprocess

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
@router.get("/health")
def health():
    def check_bin(name: str, check_arg: str = "--version") -> dict:
        for p in [f"/usr/local/bin/{name}", f"/usr/bin/{name}"]:
            if os.path.exists(p):
                try:
                    v = subprocess.run(
                        [p, check_arg], capture_output=True, text=True, timeout=5
                    ).stdout.strip().split("\n")[0]
                except Exception:
                    v = "installed"
                return {"name": name, "found": True, "version": v, "path": p}
        try:
            v = subprocess.run(
                ["which", name], capture_output=True, text=True, timeout=5
            ).stdout.strip()
            if v:
                try:
                    ver = subprocess.run(
                        [v, check_arg], capture_output=True, text=True, timeout=5
                    ).stdout.strip().split("\n")[0]
                except Exception:
                    ver = "installed"
                return {"name": name, "found": True, "version": ver, "path": v}
        except Exception:
            pass
        return {"name": name, "found": False, "version": None, "path": None}

    yt_dlp = check_bin("yt-dlp")
    ffmpeg = check_bin("ffmpeg", "-version")
    return {
        "healthy": yt_dlp["found"] and ffmpeg["found"],
        "binaries": {"ytDlp": yt_dlp, "ffmpeg": ffmpeg},
    }
