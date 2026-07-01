"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

interface BatchJob {
  id: string;
  videoId: string;
  videoTitle: string;
  videoThumbnail: string | null;
  kind: string;
  quality: string | null;
  status: string;
  progressPct: number | null;
  error: string | null;
}

interface ActiveBatch {
  batch: {
    id: string;
    status: string;
    totalJobs: number;
    completedJobs: number;
    createdAt: string;
  };
  jobs: BatchJob[];
}

interface ActiveBatchesResponse {
  batches: ActiveBatch[];
  recentCompleted: ActiveBatch | null;
}

/**
 * Fixed-position download progress bar that appears when downloads are active.
 *
 * - Active: ember progress bar with per-job detail (expandable)
 * - Completed: teal flash with "Download ZIP" button, auto-dismisses after 30s
 * - Springs into view on first batch, slides away when all done
 * - Polls GET /api/batches/active every 2 seconds
 */
export function DownloadProgress() {
  const [expanded, setExpanded] = useState(false);
  const [dismissedBatchId, setDismissedBatchId] = useState<string | null>(null);
  const [seenActiveBatchIds, setSeenActiveBatchIds] = useState<string[]>([]);

  const { data } = useQuery<ActiveBatchesResponse>({
    queryKey: ["batches", "active"],
    queryFn: async () => {
      const res = await fetch("/api/batches/active");
      if (!res.ok) throw new Error("Failed to fetch active batches");
      return res.json();
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  const batches = useMemo(() => data?.batches ?? [], [data]);
  const recentCompleted = data?.recentCompleted ?? null;
  const hasActiveBatches = batches.length > 0;

  // Track active batch IDs created or running during this page view session
  useEffect(() => {
    if (batches.length > 0) {
      const ids = batches.map((b) => b.batch.id);
      setTimeout(() => {
        setSeenActiveBatchIds((prev) => {
          const next = [...prev];
          let changed = false;
          ids.forEach((id) => {
            if (!next.includes(id)) {
              next.push(id);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }, 0);
    }
  }, [batches]);

  // Compute aggregate stats for active batches
  const stats = useMemo(() => {
    if (batches.length === 0) {
      return { totalJobs: 0, completedJobs: 0, failedJobs: 0, overallPct: 0 };
    }

    let totalJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;
    let totalPct = 0;

    for (const b of batches) {
      totalJobs += b.batch.totalJobs;
      completedJobs += b.batch.completedJobs;
      for (const job of b.jobs) {
        if (job.status === "failed") failedJobs++;
        totalPct += job.progressPct ?? 0;
      }
    }

    const overallPct = totalJobs > 0 ? totalPct / totalJobs : 0;

    return { totalJobs, completedJobs, failedJobs, overallPct };
  }, [batches]);



  const isRecentCompletedValid =
    recentCompleted && seenActiveBatchIds.includes(recentCompleted.batch.id);

  // Don't render if nothing to show
  if (!hasActiveBatches && !isRecentCompletedValid) return null;

  // Show completed batch (with individual download links) when no active batches
  if (
    !hasActiveBatches &&
    isRecentCompletedValid &&
    dismissedBatchId !== recentCompleted.batch.id
  ) {
    const rc = recentCompleted;
    const doneJobs = rc.jobs.filter((j) => j.status === "done");
    const failedCount = rc.jobs.filter((j) => j.status === "failed").length;

    const handleDownload = (jobId: string) => {
      const link = document.createElement("a");
      link.href = `/api/batches/${rc.batch.id}/download?jobId=${jobId}`;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <AnimatePresence>
        <motion.div
          key="download-complete"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 z-[50] w-[min(480px,90vw)]"
        >
          <div className="rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--accent-teal)]/30 border-l-[3px] border-l-[var(--accent-teal)] shadow-[var(--shadow-float)] overflow-hidden">
            <div className="flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)]">
              <CheckCircle
                size={16}
                className="text-[var(--accent-teal)] shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p className="text-[var(--text-body)] text-[var(--text-primary)] font-medium">
                  {rc.batch.totalJobs === 1
                    ? "Download complete"
                    : `Downloaded ${doneJobs.length} ${doneJobs.length === 1 ? "video" : "videos"}`}
                  {failedCount > 0 && (
                    <span className="text-[var(--accent-red)] font-normal">
                      {" "}
                      · {failedCount} failed
                    </span>
                  )}
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => setDismissedBatchId(rc.batch.id)}
                className="w-[24px] h-[24px] rounded-[4px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] transition-all duration-[140ms] ease-out cursor-pointer"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>

            {/* Individual download buttons */}
            {doneJobs.length > 0 && (
              <div className="border-t border-[var(--accent-teal)]/20 px-[var(--space-4)] py-[var(--space-2)] max-h-[160px] overflow-y-auto">
                {doneJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => handleDownload(job.id)}
                    className="w-full flex items-center gap-[var(--space-2)] py-[var(--space-1)] text-left hover:bg-[var(--bg-surface-raised)] rounded px-1 transition-colors cursor-pointer"
                  >
                    <CheckCircle size={12} className="text-[var(--accent-teal)] shrink-0" />
                    <span className="flex-1 truncate text-[var(--text-caption)] text-[var(--text-secondary)]">
                      {job.videoTitle}
                    </span>
                    <span className="text-[var(--text-caption)] text-[var(--accent-teal)] shrink-0">
                      save
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Active downloads in progress
  if (!hasActiveBatches) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="download-progress"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        className="fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 z-[50] w-[min(480px,90vw)]"
      >
        <div className="rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-float)] overflow-hidden">
          {/* Compact header — always visible */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] cursor-pointer"
          >
            {/* Status icon */}
            <Loader2
              size={14}
              className="text-[var(--accent-ember)] animate-spin shrink-0"
            />

            {/* Progress bar */}
            <div className="flex-1 h-[4px] rounded-full bg-[var(--bg-surface-raised)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[var(--accent-ember)]"
                initial={{ width: 0 }}
                animate={{ width: `${stats.overallPct}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            {/* Stats text */}
            <span className="mono-num text-[var(--text-caption)] text-[var(--text-secondary)] whitespace-nowrap">
              <span className="text-[var(--text-primary)] font-medium">
                {stats.completedJobs}
              </span>
              {" / "}
              {stats.totalJobs}
              {stats.failedJobs > 0 && (
                <span className="text-[var(--accent-red)]">
                  {" · "}
                  {stats.failedJobs} failed
                </span>
              )}
            </span>

            {/* Expand toggle */}
            {expanded ? (
              <ChevronDown size={14} className="text-[var(--text-secondary)]" />
            ) : (
              <ChevronUp size={14} className="text-[var(--text-secondary)]" />
            )}
          </button>

          {/* Expanded: per-job list */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-[var(--border-subtle)] px-[var(--space-4)] py-[var(--space-2)] max-h-[200px] overflow-y-auto">
                  {batches.flatMap((b) =>
                    b.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex flex-col py-[var(--space-1)]"
                      >
                        <div className="flex items-center gap-[var(--space-2)]">
                          {/* Status indicator */}
                          {job.status === "running" && (
                            <Loader2
                              size={12}
                              className="text-[var(--accent-ember)] animate-spin shrink-0"
                            />
                          )}
                          {job.status === "done" && (
                            <CheckCircle
                              size={12}
                              className="text-[var(--accent-teal)] shrink-0"
                            />
                          )}
                          {job.status === "failed" && (
                            <AlertCircle
                              size={12}
                              className="text-[var(--accent-red)] shrink-0"
                            />
                          )}
                          {job.status === "pending" && (
                            <div className="w-3 h-3 rounded-full border border-[var(--text-secondary)]/30 shrink-0" />
                          )}

                          {/* Title */}
                          <span className="flex-1 truncate text-[var(--text-caption)] text-[var(--text-secondary)]">
                            {job.videoTitle}
                          </span>

                          {/* Progress */}
                          {job.status === "running" && (
                            <span className="mono-num text-[var(--text-caption)] text-[var(--accent-ember)]">
                              {Math.round(job.progressPct ?? 0)}%
                            </span>
                          )}
                          {job.status === "done" && (
                            <span className="mono-num text-[var(--text-caption)] text-[var(--accent-teal)]">
                              100%
                            </span>
                          )}
                          {job.status === "failed" && (
                            <span className="text-[var(--text-caption)] text-[var(--accent-red)]">
                              failed
                            </span>
                          )}
                        </div>

                        {/* Error reason — shown below failed jobs */}
                        {job.status === "failed" && job.error && (
                          <p className="text-[11px] text-[var(--accent-red)]/70 ml-[20px] leading-snug mt-[1px]">
                            {job.error}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
