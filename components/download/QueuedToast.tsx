"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { useToastStore } from "@/lib/store/toast";

/**
 * Queued confirmation toast.
 *
 * Slides up from bottom-center, auto-dismisses after 3 seconds.
 * Shows: "Queued N videos for download" with ember left accent border.
 */
export function QueuedToast() {
  const message = useToastStore((s) => s.message);
  const dismiss = useToastStore((s) => s.dismiss);

  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, 3000);
    return () => clearTimeout(timer);
  }, [message, dismiss]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 z-[60]"
        >
          <div className="flex items-center gap-[var(--space-3)] rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-ember)] shadow-[var(--shadow-float)] px-[var(--space-4)] py-[var(--space-3)]">
            <CheckCircle
              size={16}
              className="text-[var(--accent-teal)] shrink-0"
            />
            <span className="text-[var(--text-body)] text-[var(--text-primary)]">
              {message}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
