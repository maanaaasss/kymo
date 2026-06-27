import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node module — exclude it from webpack bundling
  // so it's loaded at runtime via require() instead of being compiled into the bundle.
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
};

export default nextConfig;
