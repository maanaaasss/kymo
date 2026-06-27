import { execSync } from "child_process";

export interface BinaryStatus {
  name: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

/**
 * Check whether a system binary is installed and accessible on $PATH.
 * Returns structured status including the resolved path and version string.
 *
 * Used on startup and via the /api/health endpoint to show a clear,
 * friendly error when yt-dlp or ffmpeg is missing (Section 2, non-negotiable).
 */
function checkBinary(name: string): BinaryStatus {
  try {
    // Resolve the binary path
    const binPath = execSync(`command -v ${name}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    // Get version string — try both --version and -version (ffmpeg uses single dash)
    let version: string | null = null;
    try {
      const versionOutput = execSync(`${name} --version`, {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      version = versionOutput.split("\n")[0];
    } catch {
      try {
        const versionOutput = execSync(`${name} -version`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        version = versionOutput.split("\n")[0];
      } catch {
        version = "installed (version unknown)";
      }
    }

    return { name, found: true, version, path: binPath };
  } catch {
    return { name, found: false, version: null, path: null };
  }
}

export interface SystemHealthStatus {
  healthy: boolean;
  binaries: {
    ytDlp: BinaryStatus;
    ffmpeg: BinaryStatus;
  };
}

/**
 * Check all required system binaries and return overall health status.
 */
export function checkSystemHealth(): SystemHealthStatus {
  const ytDlp = checkBinary("yt-dlp");
  const ffmpeg = checkBinary("ffmpeg");

  // Clean up ffmpeg version: "ffmpeg version 8.1.2 Copyright..." → "ffmpeg 8.1.2"
  if (ffmpeg.version) {
    const match = ffmpeg.version.match(/ffmpeg version (\S+)/);
    if (match) {
      ffmpeg.version = `ffmpeg ${match[1]}`;
    }
  }

  return {
    healthy: ytDlp.found && ffmpeg.found,
    binaries: { ytDlp, ffmpeg },
  };
}
