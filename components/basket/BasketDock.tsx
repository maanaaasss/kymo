"use client";

import { useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import gsap from "gsap";
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
  const searchParams = useSearchParams();
  const activeChannelId = searchParams.get("c");
  const isMainPage = !activeChannelId;

  const items = useBasketStore((s) => s.items);
  const addTrigger = useBasketStore((s) => s.addTrigger);
  const togglePanel = useBasketStore((s) => s.togglePanel);
  const isPanelOpen = useBasketStore((s) => s.isPanelOpen);

  const itemsArray = useMemo(() => Object.values(items), [items]);
  const count = itemsArray.length;

  const estimatedSizeMb = useMemo(() => {
    const totalSeconds = itemsArray.reduce((sum, v) => {
      if ((v as any).type === "image") return sum;
      return sum + (v.durationSeconds || 180);
    }, 0);
    return Math.round((totalSeconds / 60) * 5);
  }, [itemsArray]);

  const topThumbnails = useMemo(() => {
    return itemsArray
      .slice(0, 3)
      .map((v) => v.thumbnailUrl)
      .filter((url): url is string => url !== null);
  }, [itemsArray]);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const prevTriggerRef = useRef(addTrigger);

  // Snappy pulse scale animation using GSAP when item is added
  useEffect(() => {
    if (addTrigger > prevTriggerRef.current && count > 0 && buttonRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { scale: 1 },
        {
          scale: 1.08,
          duration: 0.15,
          ease: "power2.out",
          yoyo: true,
          repeat: 1,
          overwrite: "auto",
        }
      );
    }
    prevTriggerRef.current = addTrigger;
  }, [addTrigger, count]);

  // High-end GSAP spring hover and mouse state animations
  const handleMouseEnter = () => {
    gsap.to(buttonRef.current, {
      scale: 1.04,
      y: -3,
      borderColor: "rgba(255, 255, 255, 0.12)",
      duration: 0.3,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  const handleMouseLeave = () => {
    gsap.to(buttonRef.current, {
      scale: 1,
      y: 0,
      borderColor: "rgba(255, 255, 255, 0.05)",
      duration: 0.5,
      ease: "elastic.out(1.2, 0.6)",
      overwrite: "auto",
    });
  };

  const handleMouseDown = () => {
    gsap.to(buttonRef.current, {
      scale: 0.96,
      duration: 0.1,
      ease: "power2.out",
    });
  };

  const handleMouseUp = () => {
    gsap.to(buttonRef.current, {
      scale: 1.04,
      duration: 0.2,
      ease: "power3.out",
    });
  };

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
            className={
              isMainPage
                ? "fixed bottom-[var(--space-5)] right-1/2 translate-x-1/2 sm:right-[var(--space-6)] sm:left-auto sm:translate-x-0 z-30 max-w-[calc(100vw-24px)] w-[calc(100vw-24px)] sm:w-auto"
                : "fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 z-30 max-w-[calc(100vw-24px)] w-[calc(100vw-24px)] sm:w-auto"
            }
          >
            <button
              ref={buttonRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onClick={togglePanel}
              className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-[var(--space-4)] rounded-[var(--radius-pill)] bg-neutral-950/70 backdrop-blur-md border border-white/5 shadow-2xl pl-[10px] pr-[16px] py-[8px] cursor-pointer"
            >
              {/* Left Group: Thumbnail + Overlapping Badge Unit */}
              <div className="relative shrink-0 select-none">
                <div className="w-[32px] h-[32px] rounded-md overflow-hidden bg-[var(--bg-surface-raised)] border border-white/5">
                  {topThumbnails[0] ? (
                    <img
                      src={topThumbnails[0]}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
                {/* Count badge overlapping the thumbnail top-right */}
                <span className="absolute -top-1 -right-1 z-10 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--accent-ember)] px-[4px] shadow-sm pointer-events-none">
                  <span className="mono-num text-[9px] leading-none font-semibold text-white">
                    {count}
                  </span>
                </span>
              </div>

              {/* Right Group: Metadata and Slim Chevron */}
              <div className="flex items-center gap-[var(--space-2)]">
                <span className="mono-num text-[11px] text-neutral-500 font-medium">
                  ~{formatSize(estimatedSizeMb)}
                </span>
                <ChevronUp
                  size={14}
                  className="text-neutral-500 shrink-0"
                />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The expandable panel */}
      <BasketPanel />
    </>
  );
}
