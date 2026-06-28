"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Loader2 } from "lucide-react";
import gsap from "gsap";
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
    const totalSeconds = items.reduce((sum, v) => {
      if ((v as any).type === "image") return sum;
      return sum + (v.durationSeconds || 180);
    }, 0);
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

  // Reset config to defaults when selects list is cleared
  useEffect(() => {
    if (count === 0) {
      setConfig(DEFAULT_CONFIG);
    }
  }, [count]);

  // Lock body scroll when selects panel modal is open
  useEffect(() => {
    if (isPanelOpen && count > 0) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isPanelOpen, count]);

  // Stagger elements in with GSAP when selects panel is opened
  useEffect(() => {
    if (isPanelOpen && count > 0) {
      const timer = setTimeout(() => {
        gsap.fromTo(
          ".gsap-panel-item",
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.3,
            stagger: 0.04,
            ease: "power2.out",
            overwrite: "auto",
          }
        );
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, count]);

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
            kind: (v as any).type === "image" ? "image" : "video",
            imageUrl: (v as any).type === "image" ? v.thumbnailUrl : undefined,
            imageType: (v as any).imageType,
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
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setPanel(false)}
        >
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
            className="w-full max-w-[520px] max-h-[80dvh] sm:max-h-[85dvh] flex flex-col rounded-t-[var(--radius-modal)] sm:rounded-[var(--radius-modal)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] sm:border border-b-0 sm:border-b shadow-[var(--shadow-float)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="gsap-panel-item flex items-center justify-between px-4 sm:px-6 py-[var(--space-4)] border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-[var(--space-3)]">
                <h2 className="text-[var(--text-body-lg)] font-medium text-[var(--text-primary)]">
                  Selects
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
                  aria-label="Close selects"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable item list */}
            <div className="gsap-panel-item flex-1 overflow-y-auto px-2 sm:px-3 py-[var(--space-2)] min-h-0">
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
                    Your selects list is empty — browse a channel to add videos
                  </p>
                </div>
              )}
            </div>

            {/* Config section — presets + format picker */}
            <div className="gsap-panel-item px-4 sm:px-6 py-[var(--space-4)] border-t border-[var(--border-subtle)] flex flex-col gap-[var(--space-4)]">
              <PresetPicker currentConfig={config} onSelect={setConfig} />
              <FormatPicker config={config} onChange={setConfig} />
            </div>

            {/* Summary bar + download button */}
            <div className="gsap-panel-item flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-3)] sm:gap-[var(--space-4)] px-4 sm:px-6 py-[var(--space-4)] border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5 text-[var(--text-body)] text-[var(--text-secondary)] self-start sm:self-auto">
                <span className="mono-num font-medium text-[var(--text-primary)]">
                  {count}
                </span>
                <span>{count === 1 ? "video" : "videos"}</span>
                <span>·</span>
                <span className="mono-num font-medium text-[var(--text-primary)]">
                  ~{formatSize(estimatedSizeMb)}
                </span>
              </div>

              <button
                onClick={handleDownload}
                disabled={count === 0 || isSubmitting}
                className={`
                  w-full sm:w-auto flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-pill)]
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
              <div className="px-4 sm:px-6 pb-[var(--space-3)]">
                <p className="text-[var(--text-caption)] text-[var(--accent-red)]">
                  {error}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
