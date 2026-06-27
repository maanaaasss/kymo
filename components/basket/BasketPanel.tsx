"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Loader2 } from "lucide-react";
import { useBasketStore } from "@/lib/store/basket";
import { useToastStore } from "@/lib/store/toast";
import { BasketItem } from "./BasketItem";
import { FormatPicker } from "@/components/download/FormatPicker";
import { PresetPicker } from "@/components/download/PresetPicker";
import { DEFAULT_CONFIG, type DownloadConfig } from "@/lib/types/download";

/**
 * Format file size estimate for display.
 * Examples: 184 → "184 MB", 2048 → "2.0 GB"
 */
function formatSize(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * Basket panel — expandable review list that slides up from the dock.
 *
 * Phase 3 upgrade: now includes FormatPicker, PresetPicker, and a live
 * download button that creates a batch via POST /api/batches.
 */
export function BasketPanel() {
  const basketItems = useBasketStore((s) => s.items);
  const isPanelOpen = useBasketStore((s) => s.isPanelOpen);
  const setPanel = useBasketStore((s) => s.setPanel);
  const remove = useBasketStore((s) => s.remove);
  const clear = useBasketStore((s) => s.clear);
  const showToast = useToastStore((s) => s.show);

  const items = useMemo(() => Object.values(basketItems), [basketItems]);
  const count = items.length;

  const estimatedSizeMb = useMemo(() => {
    const totalSeconds = items.reduce(
      (sum, v) => sum + (v.durationSeconds || 180), // default 3min if unknown
      0
    );
    return Math.round((totalSeconds / 60) * 5);
  }, [items]);

  // Download config state (local, not persisted)
  const [config, setConfig] = useState<DownloadConfig>(DEFAULT_CONFIG);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPanelOpen) {
        setPanel(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, setPanel]);

  // Submit batch
  const handleDownload = useCallback(async () => {
    if (count === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: items.map((v) => ({
            id: v.id,
            title: v.title,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
          })),
          config,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create batch");
      }

      const { totalJobs } = await res.json();

      // Success: clear basket, close panel, show toast
      clear();
      setPanel(false);
      showToast(
        `Queued ${totalJobs} ${totalJobs === 1 ? "video" : "videos"} for download`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong — try again"
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [count, isSubmitting, items, config, clear, setPanel, showToast]);

  return (
    <AnimatePresence>
      {isPanelOpen && count > 0 && (
        <>
          {/* Backdrop — click to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
            onClick={() => setPanel(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[520px] max-h-[80dvh] flex flex-col rounded-t-[var(--radius-modal)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-b-0 shadow-[var(--shadow-float)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-[var(--space-5)] py-[var(--space-4)] border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-[var(--space-3)]">
                <h2 className="text-[var(--text-body-lg)] font-medium text-[var(--text-primary)]">
                  Basket
                </h2>
                <span className="mono-num text-[var(--text-caption)] text-[var(--text-secondary)]">
                  {count} {count === 1 ? "video" : "videos"}
                </span>
              </div>
              <div className="flex items-center gap-[var(--space-2)]">
                <button
                  onClick={clear}
                  className="flex items-center gap-[var(--space-1)] text-[var(--text-caption)] text-[var(--text-secondary)] hover:text-[var(--accent-red)] transition-colors duration-[140ms] ease-out px-[var(--space-2)] py-[var(--space-1)] rounded-[4px] hover:bg-[var(--accent-red)]/10"
                >
                  <Trash2 size={12} />
                  Clear all
                </button>
                <button
                  onClick={() => setPanel(false)}
                  className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] transition-all duration-[140ms] ease-out"
                  aria-label="Close basket"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable item list */}
            <div className="flex-1 overflow-y-auto px-[var(--space-3)] py-[var(--space-2)] min-h-0">
              <AnimatePresence mode="popLayout">
                {items.map((video) => (
                  <BasketItem
                    key={video.id}
                    video={video}
                    onRemove={remove}
                  />
                ))}
              </AnimatePresence>

              {items.length === 0 && (
                <div className="flex items-center justify-center py-[var(--space-7)]">
                  <p className="text-[var(--text-body)] text-[var(--text-secondary)]">
                    Your basket is empty — browse a channel to add videos
                  </p>
                </div>
              )}
            </div>

            {/* Config section — presets + format picker */}
            <div className="px-[var(--space-5)] py-[var(--space-4)] border-t border-[var(--border-subtle)] flex flex-col gap-[var(--space-4)]">
              <PresetPicker currentConfig={config} onSelect={setConfig} />
              <FormatPicker config={config} onChange={setConfig} />
            </div>

            {/* Summary bar + download button */}
            <div className="flex items-center justify-between px-[var(--space-5)] py-[var(--space-4)] border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-[var(--space-3)]">
                <span className="mono-num text-[var(--text-body)] text-[var(--text-primary)] font-medium">
                  {count}
                </span>
                <span className="text-[var(--text-body)] text-[var(--text-secondary)]">
                  {count === 1 ? "video" : "videos"}
                </span>
                <span className="w-[1px] h-[14px] bg-[var(--border-subtle)]" />
                <span className="mono-num text-[var(--text-body)] text-[var(--text-secondary)]">
                  ~{formatSize(estimatedSizeMb)}
                </span>
              </div>

              <button
                onClick={handleDownload}
                disabled={count === 0 || isSubmitting}
                className={`
                  flex items-center gap-[var(--space-2)] rounded-[var(--radius-pill)]
                  bg-[var(--accent-ember)] px-[var(--space-5)] py-[var(--space-2)]
                  text-[var(--text-body)] font-medium text-white
                  transition-all duration-[140ms] ease-out cursor-pointer
                  ${
                    count === 0 || isSubmitting
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-[var(--accent-ember-hover)] active:bg-[var(--accent-ember-pressed)] active:scale-[0.98]"
                  }
                `}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Queueing…
                  </>
                ) : (
                  <>
                    Download{" "}
                    <span className="mono-num">{count}</span>{" "}
                    {count === 1 ? "video" : "videos"}
                  </>
                )}
              </button>
            </div>

            {/* Error message */}
            {error && (
              <div className="px-[var(--space-5)] pb-[var(--space-3)]">
                <p className="text-[var(--text-caption)] text-[var(--accent-red)]">
                  {error}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
