"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Star,
  Link as LinkIcon,
} from "lucide-react";
import { CapabilityCards } from "@/components/landing/CapabilityCards";
import { ChannelHeader } from "@/components/channel/ChannelHeader";
import { VideoGrid } from "@/components/channel/VideoGrid";
import { SingleVideoView } from "@/components/channel/SingleVideoView";
import gsap from "gsap";

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

let hasAnimatedGlobal = false;

const WORDS = ["thumbnail", "video", "audio", "banner", "metadata"];

const getDrawDuration = (word: string) => {
  const len = word.length;
  if (len <= 5) return 1.8;
  if (len >= 9) return 1.3;
  return 1.8 - ((len - 5) / 4) * 0.5;
};

const getRetractDuration = (word: string) => {
  const len = word.length;
  if (len <= 5) return 1.3;
  if (len >= 9) return 1.0;
  return 1.3 - ((len - 5) / 4) * 0.3;
};

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeChannelId = searchParams.get("c");
  const activeVideoId = searchParams.get("v");

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

  const [channel, setChannel] = useState<any | null>(null);
  const [videoCount, setVideoCount] = useState(0);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  // Fetch channel details client-side if a channel ID is active
  useEffect(() => {
    if (!activeChannelId) {
      setChannel(null);
      return;
    }

    async function fetchChannel() {
      setChannelLoading(true);
      setChannelError(null);
      try {
        const res = await fetch(`/api/channels/${activeChannelId}?page=1&limit=1`);
        if (!res.ok) {
          setChannelError("Channel not found");
          return;
        }
        const data = await res.json();
        setChannel(data.channel);
        setVideoCount(data.pagination.total);
      } catch {
        setChannelError("Failed to load channel");
      } finally {
        setChannelLoading(false);
      }
    }
    fetchChannel();
  }, [activeChannelId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const underlineRef = useRef<SVGSVGElement>(null);

  // Dynamic Wave Path Generator
  const generateWave = useCallback((word: string) => {
    const C = word.length;
    const W = 20; // Wavelength in viewBox units
    const viewBoxWidth = C * W;
    let d = "M 0 5 Q 5 1, 10 5";
    for (let i = 2; i <= 2 * C; i++) {
      d += ` T ${i * 10} 5`;
    }
    return {
      d,
      viewBox: `0 0 ${viewBoxWidth} 10`,
    };
  }, []);

  const [wavePath, setWavePath] = useState(() => generateWave("thumbnail").d);
  const [waveViewBox, setWaveViewBox] = useState(() => generateWave("thumbnail").viewBox);
  const [cycleIndex, setCycleIndex] = useState(0);
  const isDrawingRef = useRef(false);

  // Draw wave in whenever cycleIndex updates and isDrawingRef is set
  useEffect(() => {
    if (cycleIndex === 0 && !isDrawingRef.current) return; // skip initial mount if handled by intro

    if (!underlineRef.current) return;
    const path = underlineRef.current.querySelector("path");
    if (!path) return;

    // Retrieve active word to compute duration
    const currentWord = WORDS[cycleIndex];
    const drawDuration = getDrawDuration(currentWord);

    gsap.killTweensOf(path);
    const len = path.getTotalLength();
    path.setAttribute("stroke-dasharray", len.toString());

    if (isDrawingRef.current) {
      path.setAttribute("stroke-dashoffset", len.toString());
      gsap.to(path, { strokeDashoffset: 0, duration: drawDuration, ease: "power2.out" });
      isDrawingRef.current = false;
    }
  }, [cycleIndex]);

  // Check system health on mount
  useEffect(() => {
    async function fetchHealth() {
      const fallback = {
        healthy: false,
        binaries: {
          ytDlp: { name: "yt-dlp", found: false, version: null, path: null },
          ffmpeg: { name: "ffmpeg", found: false, version: null, path: null },
        },
      };
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (!data?.binaries) {
          setHealth(fallback);
        } else {
          setHealth(data);
        }
      } catch {
        setHealth(fallback);
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
    const hasAnimated = sessionStorage.getItem("kymo-hero-animated");
    if (!hasAnimated) {
      setShouldAnimate(true);
    } else {
      setShouldAnimate(false);
      hasAnimatedGlobal = true;
    }
  }, []);

  // Headline scramble-decode word cycle animation
  useEffect(() => {
    const words = ["thumbnail", "video", "audio", "banner", "metadata"];
    let wordIndex = 0;
    let isMounted = true;
    let scrambleInterval: NodeJS.Timeout | null = null;
    let sequenceTimeout: NodeJS.Timeout | null = null;

    // Helper to get wave path length
    const getPathInfo = () => {
      if (underlineRef.current) {
        const path = underlineRef.current.querySelector("path");
        if (path) {
          try {
            return { path, len: path.getTotalLength() };
          } catch {
            return { path, len: 182 }; // fallback if DOM not fully painted
          }
        }
      }
      return null;
    };

    // Set initial text content
    if (textRef.current) {
      textRef.current.textContent = words[0];
    }

    // Set initial underline state to fully drawn on mount
    const initUnderline = () => {
      const info = getPathInfo();
      if (info) {
        const { path, len } = info;
        path.setAttribute("stroke-dasharray", len.toString());
        path.setAttribute("stroke-dashoffset", "0");
      }
    };
    
    // Slight delay to allow DOM to paint and getTotalLength to execute correctly
    setTimeout(() => {
      if (isMounted) initUnderline();
    }, 50);

    const startNextCycle = (currentIndex: number) => {
      if (!isMounted) return;

      const nextIndex = (currentIndex + 1) % words.length;
      const targetWord = words[nextIndex];
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReduced) {
        sequenceTimeout = setTimeout(() => {
          if (!isMounted) return;
          if (textRef.current) {
            textRef.current.textContent = targetWord;
          }
          const info = getPathInfo();
          if (info) {
            info.path.setAttribute("stroke-dashoffset", "0");
          }
          startNextCycle(nextIndex);
        }, 4000);
        return;
      }

      // Step 1: Retract wave
      const info = getPathInfo();
      if (info) {
        const { path, len } = info;
        const currentWord = words[currentIndex];
        const retractDuration = getRetractDuration(currentWord);
        gsap.killTweensOf(path);
        gsap.to(path, { strokeDashoffset: len, duration: retractDuration, ease: "power2.in" });
      }

      // Step 2: After retractDuration, begin scramble loop (duration: 450ms)
      const currentWord = words[currentIndex];
      const retractDurationMs = getRetractDuration(currentWord) * 1000;
      sequenceTimeout = setTimeout(() => {
        if (!isMounted) return;

        let tick = 0;
        const totalTicks = 25;
        const tickInterval = 65; // 25 * 65 = 1625ms
        const randomChars = "abcdefghijklmnopqrstuvwxyz";

        scrambleInterval = setInterval(() => {
          tick++;
          const lockedCount = Math.floor((tick / totalTicks) * targetWord.length);
          let scrambled = targetWord.substring(0, lockedCount);
          for (let i = lockedCount; i < targetWord.length; i++) {
            scrambled += randomChars[Math.floor(Math.random() * randomChars.length)];
          }

          if (textRef.current) {
            textRef.current.textContent = scrambled;
          }

          if (tick >= totalTicks) {
            if (scrambleInterval) clearInterval(scrambleInterval);
            if (textRef.current) {
              textRef.current.textContent = targetWord;
            }

            // Trigger Step 3 (Draw) by updating wave states and setting drawing flag
            const nextWave = generateWave(targetWord);
            isDrawingRef.current = true;
            setWavePath(nextWave.d);
            setWaveViewBox(nextWave.viewBox);
            setCycleIndex(nextIndex);

            // Step 4: After draw complete, hold for exactly 4000ms, then trigger next cycle
            const drawDurationMs = getDrawDuration(targetWord) * 1000;
            sequenceTimeout = setTimeout(() => {
              if (!isMounted) return;
              startNextCycle(nextIndex);
            }, drawDurationMs + 4000);
          }
        }, tickInterval);

      }, retractDurationMs);
    };

    // Initially start the loop after the first hold duration (4000ms)
    sequenceTimeout = setTimeout(() => {
      startNextCycle(0);
    }, 4000);

    return () => {
      isMounted = false;
      if (scrambleInterval) clearInterval(scrambleInterval);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
    };
  }, [generateWave]);

  // GSAP entrance animation sequence
  useEffect(() => {
    if (shouldAnimate !== true) return;
    if (!containerRef.current) return;

    Promise.all([import("gsap")]).then(([{ default: gsap }]) => {
      const q = gsap.utils.selector(containerRef);

      gsap.set(q(".logo-animation-target"), { y: 14, opacity: 0 });
      gsap.set(q(".tagline-animation-target"), { y: 14, opacity: 0 });
      gsap.set(q(".input-animation-target"), { y: 14, opacity: 0 });
      gsap.set(q(".card-animation-target"), { scale: 0.9, rotate: 0, opacity: 0 });
      if (underlineRef.current) {
        const path = underlineRef.current.querySelector("path");
        if (path) {
          const len = path.getTotalLength();
          path.setAttribute("stroke-dasharray", len.toString());
          gsap.set(path, { strokeDashoffset: len });
        }
      }

      gsap.set(containerRef.current, { opacity: 0 });
      containerRef.current?.classList.remove("gsap-init");

      q(".logo-animation-target, .tagline-animation-target, .input-animation-target, .card-animation-target")
        .forEach((el) => el.classList.remove("gsap-init"));

      sessionStorage.setItem("kymo-hero-animated", "true");
      hasAnimatedGlobal = true;

      const tl = gsap.timeline();

      tl.addLabel("pageFade", 0);
      tl.to(
        containerRef.current,
        { opacity: 1, duration: 0.8, ease: "power2.out" },
        "pageFade"
      );

      tl.addLabel("reveal", 0.25);

      tl.to(
        q(".logo-animation-target"),
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
        "reveal"
      );

      tl.to(
        q(".tagline-animation-target"),
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
        "reveal+=0.15"
      );

      if (underlineRef.current) {
        const path = underlineRef.current.querySelector("path");
        if (path) {
          tl.to(
            path,
            { strokeDashoffset: 0, duration: 1.2, ease: "power2.out" },
            "reveal+=0.25"
          );
        }
      }

      tl.to(
        q(".input-animation-target"),
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
        "reveal+=0.3"
      );

      const cards = q(".card-animation-target");
      cards.forEach((card, idx) => {
        const restingRotation = parseFloat(
          card.getAttribute("data-resting-rotation") || "0"
        );
        tl.to(
          card,
          {
            opacity: 1,
            scale: 1,
            rotate: restingRotation,
            duration: 0.45,
            ease: "power2.out",
            onComplete: () => {
              gsap.set(card, { clearProps: "transform,rotate,scale" });
            },
          },
          `reveal+=${0.45 + idx * 0.08}`
        );
      });
    });
  }, [shouldAnimate]);

  // Strip initial hidden state class immediately if already animated
  useEffect(() => {
    if (shouldAnimate === false && containerRef.current) {
      containerRef.current.querySelectorAll(".gsap-init").forEach((el) => {
        el.classList.remove("gsap-init");
      });
      if (underlineRef.current) {
        const path = underlineRef.current.querySelector("path");
        if (path) {
          const len = path.getTotalLength();
          path.setAttribute("stroke-dasharray", len.toString());
          path.style.strokeDashoffset = "0";
        }
      }
    }
  }, [shouldAnimate]);

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

        if (data.type === "video" && data.videoId) {
          router.push(`/?v=${data.videoId}`);
        } else {
          router.push(`/?c=${data.channelId}`);
        }
      } catch (err) {
        setResolveError(
          err instanceof Error
            ? err.message
            : "Something went wrong — try again"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [url, health, router]
  );

  const isValidUrl = url.trim().length > 0;
  const missingBinaries = [];
  if (health && !health.binaries.ytDlp.found)
    missingBinaries.push(health.binaries.ytDlp);
  if (health && !health.binaries.ffmpeg.found)
    missingBinaries.push(health.binaries.ffmpeg);

  const initClass =
    shouldAnimate === null || shouldAnimate === true ? "gsap-init" : "";

  if (activeVideoId) {
    return (
      <div className="flex flex-col flex-1 bg-[var(--bg-canvas)] w-full min-h-screen">
        {/* Header containing a minimal navigation row for back tracking */}
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="mx-auto max-w-[1200px] px-[var(--space-5)] pt-[var(--space-3)] pb-[var(--space-3)]">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] transition-all duration-[140ms] ease-out cursor-pointer"
              aria-label="Back to landing page"
            >
              <LinkIcon size={11} />
              Paste another link
            </button>
          </div>
        </div>

        <main className="flex-1 mx-auto w-full max-w-[1200px] px-[var(--space-5)] py-[var(--space-6)]">
          <SingleVideoView
            videoId={activeVideoId}
            onBrowseChannel={(channelId) => router.push(`/?c=${channelId}`)}
          />
        </main>
      </div>
    );
  }

  if (activeChannelId) {
    if (channelLoading) {
      return (
        <div className="flex flex-1 items-center justify-center py-20 bg-[var(--bg-canvas)] min-h-[80vh]">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
        </div>
      );
    }

    if (channelError || !channel) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-[var(--text-secondary)] bg-[var(--bg-canvas)] min-h-[80vh] gap-[var(--space-3)]">
          <p>{channelError ?? "Channel not found"}</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] transition-all cursor-pointer"
          >
            Go back
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 bg-[var(--bg-canvas)] w-full min-h-screen">
        <ChannelHeader
          title={channel.title}
          videoCount={videoCount}
          thumbnailUrl={channel.thumbnailUrl}
          bannerUrl={channel.bannerUrl}
          handle={channel.handle}
          subscriberCount={channel.subscriberCount}
          description={channel.description}
          verified={channel.verified}
          onReset={() => router.push("/")}
        />

        <main className="flex-1 mx-auto w-full max-w-[1200px] px-[var(--space-5)] py-[var(--space-5)]">
          <VideoGrid channelId={activeChannelId} channelTitle={channel.title} />
        </main>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col min-h-screen justify-between items-center px-[var(--space-5)] py-[var(--space-5)] relative page-reveal-container ${initClass}`}
    >
      {/* Header containing Kymo logo and GitHub link */}
      <header
        className={`
          w-full max-w-[560px] md:max-w-none md:absolute md:top-[var(--space-5)] md:left-0 md:right-0 md:px-[var(--space-5)]
          flex items-center justify-between gap-4 select-none z-10 shrink-0
          mb-[var(--space-6)] md:mb-0
          logo-animation-target ${initClass}
        `}
      >
        {/* Kymo Logo */}
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 34 20"
            width="34"
            height="20"
            fill="none"
            className="text-[#E2692F]"
          >
            <path
              d="M2 10 C 5 3, 9 3, 12 10 C 15 17, 19 17, 22 10 C 25 3, 29 3, 32 10"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-sans font-medium text-[16px] text-[var(--text-primary)] leading-none mt-[-1px]">
            Kymo
          </span>
        </div>

        {/* GitHub Star Button */}
        <a
          href="https://github.com/maanaaasss/tube.manaaasss"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div
            className="
              flex items-center gap-[var(--space-2)]
              rounded-[var(--radius-card)]
              border border-[var(--border-subtle)]
              bg-[var(--bg-surface)]
              px-[var(--space-3)] py-[var(--space-2)]
              text-[var(--text-body)] text-[var(--text-secondary)]
              transition-all duration-[140ms] ease-out
              hover:border-[var(--accent-ember)]/50 hover:text-[var(--text-primary)]
              hover:bg-[var(--bg-surface-raised)]
            "
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <Star size={14} />
            <span className="font-medium">Star</span>
          </div>
        </a>
      </header>

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
      <main className="w-full max-w-[560px] flex-1 flex flex-col justify-center py-[var(--space-6)] relative z-10 my-auto">
        
        {/* Headline */}
        <div className="text-center sm:text-left mb-[var(--space-7)] select-none w-full">
          <h1
            className={`tagline-animation-target flex flex-col sm:flex-row flex-wrap items-center justify-center sm:justify-start relative z-10 w-full tracking-tight leading-none ${initClass}`}
          >
            {/* Line 1: "Download YouTube" */}
            <span className="text-[22px] min-[360px]:text-[24px] sm:text-[30px] font-medium text-[var(--text-primary)] sm:pr-2 block sm:inline text-center sm:text-left">
              Download YouTube
            </span>

            {/* Line 2: The cycling word */}
            <span className="relative flex justify-center sm:justify-start items-center select-none mt-2 sm:mt-0 w-full sm:w-auto">
              <span 
                className="inline-block relative overflow-hidden whitespace-nowrap text-center sm:text-left w-[150px] sm:w-auto px-1"
                style={{ paddingBottom: "0.35em" }}
              >
                <span className="relative inline-block">
                  <span
                    ref={textRef}
                    className="italic font-medium text-[27px] sm:text-[30px] pr-[0.06em] inline-block"
                    style={{ color: "#E2692F" }}
                  >
                    video
                  </span>
                  <svg
                    ref={underlineRef}
                    className="absolute left-0 w-full pointer-events-none"
                    style={{ bottom: "-0.2em", height: "0.3em" }}
                    viewBox={waveViewBox}
                    preserveAspectRatio="none"
                  >
                    <path
                      d={wavePath}
                      fill="none"
                      stroke="#E2692F"
                      strokeWidth="1.8"
                      className="sm:stroke-[2.3]"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
            </span>
          </h1>
        </div>

        {/* URL Input */}
        <form
          onSubmit={handleSubmit}
          className={`relative input-animation-target w-full ${initClass}`}
        >
          <div
            className={`
              relative flex items-center w-full
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
              className={`ml-[var(--space-4)] shrink-0 transition-colors duration-200 ${
                isFocused || isValidUrl ? "text-[#E2692F]" : "text-[var(--text-secondary)]/60"
              }`}
            />
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="What are we grabbing? Paste a link..."
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
          onHoverCard={() => {}}
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
              className="absolute left-0 right-0 -bottom-[32px] text-center text-[var(--text-body)] text-[var(--text-secondary)] pointer-events-none"
            >
              Grabbing channel info... Sit tight, this can take a sec.
            </motion.p>
          )}
        </AnimatePresence>
      </main>

      {/* Footer with version / attribution */}
      <footer className="text-[var(--text-caption)] text-[var(--text-secondary)]/40 text-center select-none shrink-0 pb-1 mt-[var(--space-6)] relative">
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
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center py-20 bg-[var(--bg-canvas)] min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  );
}
