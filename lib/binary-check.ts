import { execSync } from "child_process";
import { existsSync } from "fs";

export interface BinaryStatus {
  name: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

const KNOWN_PATHS: Record<string, string[]> = {
  "yt-dlp": [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/yt-dlp",
  ],
  ffmpeg: [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
  ],
};

function resolveBinary(name: string): string | null {
  // Try PATH lookup first
  for (const cmd of [`command -v ${name}`, `which ${name}`]) {
    try {
      const result = execSync(cmd, {
        encoding: "utf-8",
        timeout: 5000,
        env: {
          ...process.env,
          PATH: [
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/opt/homebrew/bin",
            process.env.PATH,
          ]
            .filter(Boolean)
            .join(":"),
        },
      }).trim();
      if (result) return result;
    } catch {
      // continue
    }
  }
  // Fallback: check known paths directly
  for (const p of KNOWN_PATHS[name] ?? []) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Check whether a system binary is installed and accessible.
 * Returns structured status including the resolved path and version string.
 */
function checkBinary(name: string): BinaryStatus {
  const binPath = resolveBinary(name);
  if (!binPath) {
    return { name, found: false, version: null, path: null };
  }

  let version: string | null = null;
  try {
    const versionOutput = execSync(`${binPath} --version`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    version = versionOutput.split("\n")[0];
  } catch {
    try {
      const versionOutput = execSync(`${binPath} -version`, {
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
