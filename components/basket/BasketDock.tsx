"use client";

import { useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useBasketStore } from "@/lib/store/basket";
import { BasketPanel } from "./BasketPanel";

/**
 * Format file size estimate for display.
 */
function formatSize(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * The basket dock — the signature element of the whole app (Section 3.3).
 *
 * A pill-shaped bar floating bottom-center that:
 * - Is hidden when basket is empty
 * - Springs into view on first selection (spring physics, not linear)
 * - Shows stacked thumbnail preview (top 3, offset like a hand of cards)
 * - Shows count badge in --accent-ember + live mono-num size estimate
 * - Pulses briefly when items are added (spring scale)
 * - Clicking expands upward into the BasketPanel
 *
 * Respects prefers-reduced-motion: degrades to 100ms opacity fade.
 */
export function BasketDock() {
  const items = useBasketStore((s) => s.items);
  const addTrigger = useBasketStore((s) => s.addTrigger);
  const togglePanel = useBasketStore((s) => s.togglePanel);
  const isPanelOpen = useBasketStore((s) => s.isPanelOpen);

  const itemsArray = useMemo(() => Object.values(items), [items]);
  const count = itemsArray.length;

  const estimatedSizeMb = useMemo(() => {
    const totalSeconds = itemsArray.reduce(
      (sum, v) => sum + (v.durationSeconds || 180), // default 3min if unknown
      0
    );
    return Math.round((totalSeconds / 60) * 5);
  }, [itemsArray]);

  const topThumbnails = useMemo(() => {
    return itemsArray
      .slice(0, 3)
      .map((v) => v.thumbnailUrl)
      .filter((url): url is string => url !== null);
  }, [itemsArray]);

  const controls = useAnimation();
  const prevTriggerRef = useRef(addTrigger);

  // Pulse animation when items are added
  useEffect(() => {
    if (addTrigger > prevTriggerRef.current && count > 0) {
      controls.start({
        scale: [1, 1.05, 1],
        transition: {
          duration: 0.3,
          ease: "easeOut",
        },
      });
    }
    prevTriggerRef.current = addTrigger;
  }, [addTrigger, count, controls]);

  return (
    <>
      {/* The dock itself */}
      <AnimatePresence>
        {count > 0 && !isPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            className="fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 z-30"
          >
            <motion.button
              animate={controls}
              onClick={togglePanel}
              className="flex items-center gap-[var(--space-3)] rounded-[var(--radius-pill)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-float)] pl-[var(--space-3)] pr-[var(--space-4)] py-[var(--space-2)] cursor-pointer transition-colors duration-[140ms] ease-out hover:border-[var(--text-secondary)]/40"
            >
              {/* Stacked thumbnail preview — top 3, offset like a hand of cards */}
              <div className="relative w-[52px] h-[32px] shrink-0">
                {topThumbnails.map((url, i) => (
                  <div
                    key={url}
                    className="absolute rounded-[4px] overflow-hidden border border-[var(--bg-surface)]"
                    style={{
                      width: 36,
                      height: 20,
                      left: i * 7,
                      top: (2 - i) * 2,
                      zIndex: 3 - i,
                      transform: `rotate(${(i - 1) * 3}deg)`,
                    }}
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ))}
                {topThumbnails.length === 0 && (
                  <div className="w-[36px] h-[20px] rounded-[4px] bg-[var(--bg-surface-raised)]" />
                )}
              </div>

              {/* Count badge */}
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-[var(--accent-ember)] px-[6px]">
                <span className="mono-num text-[12px] leading-none font-medium text-white">
                  {count}
                </span>
              </span>

              {/* Size estimate */}
              <span className="mono-num text-[var(--text-caption)] text-[var(--text-secondary)]">
                ~{formatSize(estimatedSizeMb)}
              </span>

              {/* Expand hint */}
              <ChevronUp
                size={14}
                className="text-[var(--text-secondary)] ml-[var(--space-1)]"
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The expandable panel */}
      <BasketPanel />
    </>
  );
}
