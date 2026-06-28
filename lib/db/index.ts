import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

/**
 * SQLite database path — stored in a `data/` directory at the project root.
 * The directory is auto-created if it doesn't exist.
 */
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "kymo.db");

// Ensure the data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

/**
 * Raw better-sqlite3 connection.
 * WAL mode is enabled for better concurrent read/write performance
 * (the worker process and Next.js server both access this DB).
 */
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/**
 * Drizzle ORM client — the primary export for all database operations.
 * Schema is attached for type-safe query building.
 */
export const db = drizzle(sqlite, { schema });

/**
 * Initialize the database tables if they don't exist.
 * Called on first import — safe to run multiple times.
 */
function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      banner_url TEXT,
      fetched_at INTEGER NOT NULL,
      handle TEXT,
      subscriber_count INTEGER,
      description TEXT,
      verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES channels(id),
      title TEXT NOT NULL,
      duration_seconds INTEGER,
      thumbnail_url TEXT,
      published_at INTEGER,
      available_formats TEXT,
      fetched_at INTEGER NOT NULL,
      tab TEXT NOT NULL DEFAULT 'videos',
      view_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      total_jobs INTEGER NOT NULL,
      completed_jobs INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      batch_id TEXT REFERENCES batches(id),
      video_id TEXT REFERENCES videos(id),
      kind TEXT NOT NULL,
      quality TEXT,
      include_thumbnail INTEGER NOT NULL DEFAULT 0,
      include_metadata INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      progress_pct REAL DEFAULT 0,
      output_path TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS download_history (
      video_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      downloaded_at INTEGER NOT NULL,
      PRIMARY KEY (video_id, kind)
    );
  `);

  // Migrate existing databases to add 'tab' column if missing
  try {
    sqlite.exec("ALTER TABLE videos ADD COLUMN tab TEXT NOT NULL DEFAULT 'videos'");
  } catch {
    // Ignore error if column already exists
  }

  // Migrate existing databases to add 'view_count' column if missing
  try {
    sqlite.exec("ALTER TABLE videos ADD COLUMN view_count INTEGER");
  } catch {
    // Ignore error if column already exists
  }

  // Migrate existing databases for rich channel fields
  try { sqlite.exec("ALTER TABLE channels ADD COLUMN handle TEXT"); } catch {}
  try { sqlite.exec("ALTER TABLE channels ADD COLUMN subscriber_count INTEGER"); } catch {}
  try { sqlite.exec("ALTER TABLE channels ADD COLUMN description TEXT"); } catch {}
  try { sqlite.exec("ALTER TABLE channels ADD COLUMN verified INTEGER DEFAULT 0"); } catch {}
}

// Auto-initialize on first import
initializeDatabase();
