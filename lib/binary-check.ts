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
  for (const p of KNOWN_PATHS[name] ?? []) {
    if (existsSync(p)) return p;
  }
  return null;
}

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

export function checkSystemHealth(): SystemHealthStatus {
  const ytDlp = checkBinary("yt-dlp");
  const ffmpeg = checkBinary("ffmpeg");

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
