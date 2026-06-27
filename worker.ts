/**
 * Background download worker.
 *
 * Standalone Node.js process that polls SQLite for pending jobs,
 * spawns yt-dlp, and tracks progress. Can be run via:
 *   - `npm run worker` (manual start)
 *   - Auto-forked by instrumentation.ts (Next.js server startup)
 */

import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processJob, startupCleanup } from "@/lib/worker/processor";
import { sleep } from "@/lib/worker/progress";

const POLL_INTERVAL_MS = 2_000;
const CONCURRENCY_CAP = 3;
const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Delay (ms) between spawning consecutive jobs to avoid rate-limiting. */
const INTER_JOB_DELAY_MS = 1_500;

const inFlight = new Set<string>();
let shuttingDown = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Crash recovery: reset all jobs stuck in "running" state back to "pending".
 * These were interrupted by a previous crash or kill.
 */
async function recoverStaleJobs(): Promise<void> {
  try {
    const staleJobs = await db.query.jobs.findMany({
      where: eq(jobs.status, "running"),
    });

    if (staleJobs.length > 0) {
      await db
        .update(jobs)
        .set({ status: "pending", progressPct: 0 })
        .where(eq(jobs.status, "running"))
        .run();

      console.log(
        `[worker] Recovered ${staleJobs.length} stale job(s) — reset to pending`
      );
    }
  } catch (err) {
    console.error("[worker] Failed to recover stale jobs:", err);
  }
}

/**
 * Poll for pending jobs and spawn processors up to the concurrency cap.
 * Spawns jobs with a delay between them to avoid rate-limiting.
 */
async function pollPendingJobs(): Promise<void> {
  if (shuttingDown) return;

  const availableSlots = CONCURRENCY_CAP - inFlight.size;
  if (availableSlots <= 0) return;

  let pendingJobs;
  try {
    pendingJobs = await db.query.jobs.findMany({
      where: eq(jobs.status, "pending"),
    });
  } catch (err) {
    console.error("[worker] Failed to query pending jobs:", err);
    return;
  }

  // Sort by creation time (oldest first) and take up to available slots
  const sorted = pendingJobs
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, availableSlots);

  for (let i = 0; i < sorted.length; i++) {
    if (shuttingDown) break;

    const job = sorted[i];
    inFlight.add(job.id);

    console.log(`[worker] Starting job ${job.id}`);

    processJob(job.id)
      .catch((err) => {
        console.error(
          `[worker] Unexpected error processing job ${job.id}:`,
          err
        );
      })
      .finally(() => {
        inFlight.delete(job.id);

        // If shutting down and no more in-flight, exit
        if (shuttingDown && inFlight.size === 0) {
          console.log("[worker] All jobs finished — shutting down");
          process.exit(0);
        }
      });

    // Delay between spawns (skip after the last one)
    if (i < sorted.length - 1) {
      await sleep(INTER_JOB_DELAY_MS);
    }
  }
}

/**
 * Graceful shutdown: stop polling, wait for in-flight jobs, then exit.
 */
function gracefulShutdown(signal: string): void {
  console.log(`[worker] Received ${signal} — shutting down gracefully`);

  shuttingDown = true;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (inFlight.size === 0) {
    console.log("[worker] No jobs in flight — exiting immediately");
    process.exit(0);
  }

  console.log(
    `[worker] Waiting for ${inFlight.size} in-flight job(s) to finish...`
  );

  // Force kill after timeout
  setTimeout(() => {
    console.error(
      `[worker] Timeout after ${SHUTDOWN_TIMEOUT_MS}ms — force exiting with ${inFlight.size} job(s) still running`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("[worker] Starting download worker...");
console.log(`[worker] Concurrency cap: ${CONCURRENCY_CAP}`);
console.log(`[worker] Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log(`[worker] Inter-job delay: ${INTER_JOB_DELAY_MS}ms`);

// Step 1: Recover stale jobs + clean temp files
recoverStaleJobs()
  .then(() => {
    startupCleanup();

    // Step 2: Start the poll loop (immediate first poll + interval)
    pollPendingJobs();
    pollTimer = setInterval(() => {
      pollPendingJobs().catch((err) => {
        console.error("[worker] Poll loop error:", err);
      });
    }, POLL_INTERVAL_MS);
  })
  .catch((err) => {
    console.error("[worker] Failed during startup:", err);
    process.exit(1);
  });

// Step 3: Listen for shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled errors to prevent silent crashes
process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
});
