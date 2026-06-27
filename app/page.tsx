"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { CapabilityCards } from "@/components/landing/CapabilityCards";

interface BinaryStatus {
  name: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

interface SystemHealthStatus {
  healthy: boolean;
  binaries: {
    ytDlp: BinaryStatus;
    ffmpeg: BinaryStatus;
  };
}

interface RecentChannel {
  id: string;
  title: string;
}

let hasAnimatedGlobal = false;

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [shouldAnimate, setShouldAnimate] = useState<boolean | null>(() => {
    if (hasAnimatedGlobal) return false;
    return null;
  });
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotating Headline State (Flatking-Inspired)
  const headlineWords = ["video", "audio", "thumbnail", "banner"];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [nextWordIndex, setNextWordIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const wordIndexRef = useRef(0);
  const cycleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hoverResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentWord = headlineWords[currentWordIndex];
  const nextWord = headlineWords[nextWordIndex];
  const maxWordLength = Math.max(...headlineWords.map((w) => w.length));

  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSwap = useCallback(
    (targetIndex: number) => {
      if (targetIndex === wordIndexRef.current) return;

      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }

      setCurrentWordIndex(wordIndexRef.current);
      setIsTransitioning(true);
      wordIndexRef.current = targetIndex;
      setNextWordIndex(targetIndex);

      transitionTimeoutRef.current = setTimeout(() => {
        setCurrentWordIndex(targetIndex);
        setIsTransitioning(false);
        transitionTimeoutRef.current = null;
      }, 650);
    },
    []
  );

  const startWordSwap = useCallback(() => {
    if (cycleIntervalRef.current) clearInterval(cycleIntervalRef.current);
    cycleIntervalRef.current = setInterval(() => {
      const nextIndex = (wordIndexRef.current + 1) % headlineWords.length;
      triggerSwap(nextIndex);
    }, 2300);
  }, [triggerSwap, headlineWords.length]);

  const handleHoverCard = useCallback(
    (index: number | null) => {
      if (hoverResumeTimeoutRef.current) {
        clearTimeout(hoverResumeTimeoutRef.current);
        hoverResumeTimeoutRef.current = null;
      }

      if (index !== null) {
        if (cycleIntervalRef.current) {
          clearInterval(cycleIntervalRef.current);
          cycleIntervalRef.current = null;
        }
        triggerSwap(index);
      } else {
        hoverResumeTimeoutRef.current = setTimeout(() => {
          startWordSwap();
        }, 2000);
      }
    },
    [triggerSwap, startWordSwap]
  );

  // Check system health on mount
  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        setHealth(data);
      } catch {
        setHealth({
          healthy: false,
          binaries: {
            ytDlp: { name: "yt-dlp", found: false, version: null, path: null },
            ffmpeg: { name: "ffmpeg", found: false, version: null, path: null },
          },
        });
      } finally {
        setHealthLoading(false);
      }
    }
    fetchHealth();
  }, []);

  // Auto-focus the URL input on page load
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Determine if we should play the entry animation
  useEffect(() => {
    const hasAnimated = sessionStorage.getItem("loupe-hero-animated");
    if (!hasAnimated) {
      setShouldAnimate(true);
    } else {
      setShouldAnimate(false);
      hasAnimatedGlobal = true;
    }
  }, []);

  // GSAP entrance animation sequence
  useEffect(() => {
    if (shouldAnimate !== true) return;

    Promise.all([import("gsap")]).then(([{ default: gsap }]) => {
      // Set initial state coordinates for the reveal
      gsap.set(".logo-animation-target", { y: 14, opacity: 0 });
      gsap.set(".tagline-animation-target", { y: 14, opacity: 0 });
      gsap.set(".input-animation-target", { y: 14, opacity: 0 });
      gsap.set(".card-animation-target", { y: 14, rotate: 0, opacity: 0 });

      // Strip page container gsap-init
      gsap.set(".page-reveal-container", { opacity: 0 });
      document.querySelector(".page-reveal-container")?.classList.remove("gsap-init");

      // Strip .gsap-init classes from targets
      document
        .querySelectorAll(
          ".logo-animation-target, .tagline-animation-target, .input-animation-target, .card-animation-target"
        )
        .forEach((el) => el.classList.remove("gsap-init"));

      // Mark as animated immediately to prevent replay triggers on navigate/refresh
      sessionStorage.setItem("loupe-hero-animated", "true");
      hasAnimatedGlobal = true;

      const tl = gsap.timeline();

      // --- PHASE 1: PAGE CONTAINER FADE IN ---
      tl.addLabel("pageFade", 0);
      tl.to(
        ".page-reveal-container",
        {
          opacity: 1,
          duration: 0.8,
          ease: "power2.out",
        },
        "pageFade"
      );

      // --- PHASE 2: REVEAL ---
      tl.addLabel("reveal", 0.25);

      // 1. Logo
      tl.to(
        ".logo-animation-target",
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
        },
        "reveal"
      );

      // 2. Headline Tagline
      tl.to(
        ".tagline-animation-target",
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
        },
        "reveal+=0.15"
      );

      // 3. Input form field
      tl.to(
        ".input-animation-target",
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
        },
        "reveal+=0.3"
      );

      // 4. Staggered capability cards fanned deck reveal
      const cards = document.querySelectorAll(".card-animation-target");
      cards.forEach((card, idx) => {
        const restingRotation = parseFloat(
          card.getAttribute("data-resting-rotation") || "0"
        );
        tl.to(
          card,
          {
            opacity: 1,
            y: 0,
            rotate: restingRotation,
            duration: 0.5,
            ease: "back.out(1.5)",
            onComplete: () => {
              // Clear inline GSAP transforms once completed so CSS card transitions can work
              gsap.set(card, { clearProps: "transform,rotate" });
            },
          },
          `reveal+=${0.45 + idx * 0.08}`
        );
      });

      // --- PHASE 3: RUN CYCLER ---
      tl.call(startWordSwap, [], "reveal+=0.4");
    });
  }, [shouldAnimate, startWordSwap]);

  // Strip initial hidden state class immediately if already animated
  useEffect(() => {
    if (shouldAnimate === false) {
      document.querySelectorAll(".gsap-init").forEach((el) => {
        el.classList.remove("gsap-init");
      });
      // Start cycles instantly if entrance timeline is bypassed
      startWordSwap();
    }
  }, [shouldAnimate, startWordSwap]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (cycleIntervalRef.current) clearInterval(cycleIntervalRef.current);
      if (hoverResumeTimeoutRef.current)
        clearTimeout(hoverResumeTimeoutRef.current);
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim() || !health?.healthy) return;

      setIsLoading(true);
      setResolveError(null);

      try {
        const res = await fetch("/api/resolve-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        const data = await res.json();

        if (!res.ok) {
          setResolveError(data.error || "Something went wrong — try again");
          return;
        }

        // Navigate to the channel page
        router.push(`/channel/${data.channelId}`);
      } catch {
        setResolveError(
          "Couldn't connect to the server — is it still running?"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [url, health, router]
  );

  const isValidUrl = url.trim().length > 0;
  const missingBinaries: BinaryStatus[] = [];
  if (health && !health.binaries.ytDlp.found)
    missingBinaries.push(health.binaries.ytDlp);
  if (health && !health.binaries.ffmpeg.found)
    missingBinaries.push(health.binaries.ffmpeg);

  const initClass =
    shouldAnimate === null || shouldAnimate === true ? "gsap-init" : "";

  return (
    <div className={`flex flex-1 flex-col items-center justify-center px-[var(--space-5)] py-[var(--space-7)] relative page-reveal-container ${initClass}`}>
      
      {/* Viewfinder Logo - top-left corner */}
      <div
        className={`absolute top-[var(--space-5)] left-[var(--space-5)] logo-animation-target z-10 ${initClass}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 18 18"
          className="text-[var(--accent-ember)]"
        >
          {/* Top-Left L-shape */}
          <path
            d="M2 7V2H7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bottom-Right L-shape */}
          <path
            d="M16 11V16H11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Binary status banners */}
      <AnimatePresence>
        {!healthLoading && missingBinaries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="mb-[var(--space-6)] w-full max-w-[560px]"
          >
            <div className="rounded-[var(--radius-card)] border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 p-[var(--space-4)]">
              <div className="flex items-start gap-[var(--space-3)]">
                <AlertTriangle
                  className="mt-[1px] shrink-0 text-[var(--accent-red)]"
                  size={18}
                />
                <div className="flex flex-col gap-[var(--space-2)]">
                  {missingBinaries.map((bin) => (
                    <div key={bin.name}>
                      <p className="text-[var(--text-body)] font-medium text-[var(--text-primary)]">
                        {bin.name} wasn&apos;t found on this machine
                      </p>
                      <p className="text-[var(--text-caption)] text-[var(--text-secondary)] mt-[var(--space-1)]">
                        {bin.name === "yt-dlp"
                          ? "Install it with: brew install yt-dlp (macOS) or pip install yt-dlp"
                          : "Install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="w-full max-w-[560px]">
        
        {/* Rotating Headline Container */}
        <div className="text-center mb-[var(--space-7)]">
          {/* Rotating Headline */}
          <div
            className={`tagline-animation-target text-[28px] md:text-[30px] font-medium text-text-primary tracking-tight leading-none whitespace-nowrap flex items-center justify-center gap-1.5 relative z-10 ${initClass}`}
          >
            <span>Download YouTube</span>
            <span
              className="relative inline-block text-left"
              style={{ width: `${maxWordLength * 16}px` }}
            >
              <span
                className={`word-cycler-container ${
                  isTransitioning ? "trigger-slide" : ""
                }`}
              >
                {(() => {
                  const maxLength = Math.max(currentWord.length, nextWord.length);
                  return Array.from({ length: maxLength }).map((_, index) => {
                    const char1 = currentWord[index] || " ";
                    const char2 = nextWord[index] || " ";
                    return (
                      <span key={index} className="char-slot">
                        <span
                          className="char-line first font-sans"
                          style={{
                            transitionDelay: `${index * 0.02}s`,
                          }}
                        >
                          {char1 === " " ? "\u00A0" : char1}
                        </span>
                        <span
                          className="char-line second font-sans"
                          style={{
                            transitionDelay: `${index * 0.03 + 0.05}s`,
                          }}
                        >
                          {char2 === " " ? "\u00A0" : char2}
                        </span>
                      </span>
                    );
                  });
                })()}
              </span>
            </span>
          </div>
        </div>

        {/* URL Input */}
        <form
          onSubmit={handleSubmit}
          className={`relative input-animation-target ${initClass}`}
        >
          <div
            className={`
              relative flex items-center
              rounded-[var(--radius-card)] border
              bg-[var(--bg-surface)]
              transition-all duration-[140ms] ease-out
              ${
                isFocused
                  ? "border-[var(--accent-ember)]"
                  : isValidUrl
                  ? "border-[var(--accent-ember)]/50"
                  : "border-[var(--border-subtle)] hover:border-[var(--text-secondary)]/30"
              }
            `}
          >
            <LinkIcon
              size={16}
              className="ml-[var(--space-4)] shrink-0 text-[var(--text-secondary)]"
            />
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Paste a YouTube channel, playlist, or video URL…"
              disabled={!health?.healthy && !healthLoading}
              className={`
                flex-1 bg-transparent
                px-[var(--space-3)] py-[var(--space-4)]
                text-[var(--text-body-lg)] text-[var(--text-primary)]
                placeholder:text-[var(--text-secondary)]/60
                outline-none
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            />
            <AnimatePresence mode="wait">
              {isValidUrl && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  type="submit"
                  disabled={isLoading || (!health?.healthy && !healthLoading)}
                  className={`
                    mr-[var(--space-2)] shrink-0
                    flex items-center gap-[var(--space-2)]
                    rounded-[var(--radius-pill)]
                    bg-[var(--accent-ember)]
                    px-[var(--space-4)] py-[var(--space-2)]
                    text-[var(--text-body)] font-medium text-white
                    transition-colors duration-[140ms] ease-out
                    hover:bg-[var(--accent-ember-hover)]
                    active:bg-[var(--accent-ember-pressed)]
                    disabled:opacity-40 disabled:cursor-not-allowed
                  `}
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Browse
                      <ArrowRight size={14} />
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>

        {/* Capability Cards */}
        <CapabilityCards
          onHoverCard={handleHoverCard}
          shouldAnimate={shouldAnimate}
        />

        {/* Error message */}
        <AnimatePresence>
          {resolveError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="mt-[var(--space-4)] rounded-[var(--radius-card)] border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-[var(--space-4)] py-[var(--space-3)]"
            >
              <p className="text-[var(--text-body)] text-[var(--accent-red)]">
                {resolveError}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading status text */}
        <AnimatePresence>
          {isLoading && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-[var(--space-4)] text-center text-[var(--text-body)] text-[var(--text-secondary)]"
            >
              Fetching channel — this can take a moment for large channels…
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Footer with version / attribution */}
      <div className="absolute bottom-[var(--space-5)] text-[var(--text-caption)] text-[var(--text-secondary)]/40 text-center">
        <span>
          built with ❤️ by{" "}
          <a
            href="https://github.com/maanaaasss"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--accent-ember)] transition-colors duration-[140ms] font-medium"
          >
            maanaaasss
          </a>
        </span>
      </div>
    </div>
  );
}
