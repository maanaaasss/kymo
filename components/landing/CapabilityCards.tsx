"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  rotationClass: string;
  zIndexClass: string;
  restingRotation: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  shouldAnimate: boolean | null;
}

function Card({
  children,
  rotationClass,
  zIndexClass,
  restingRotation,
  onMouseEnter,
  onMouseLeave,
  shouldAnimate,
}: CardProps) {
  const initClass =
    shouldAnimate === null || shouldAnimate === true ? "gsap-init" : "";

  return (
    <div
      data-resting-rotation={restingRotation}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        card-animation-target ${initClass}
        w-[148px] h-[190px] rounded-[12px]
        bg-[#1C1D24] border border-[#2A2B33]
        select-none relative overflow-hidden
        ${rotationClass} ${zIndexClass}
        hover:z-50
      `}
      style={{ boxShadow: "none" }} // Ensure box-shadow is entirely removed
    >
      {/* Subtle grain/noise texture overlay on card */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.055] mix-blend-mode-overlay pointer-events-none rounded-[12px]">
        <filter id="card-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#card-grain)" />
      </svg>
      {/* Card Content container on top of grain */}
      <div className="relative z-10 flex flex-col h-full w-full p-[14px]">
        {children}
      </div>
    </div>
  );
}

export function CapabilityCards({
  onHoverCard,
  shouldAnimate,
}: {
  onHoverCard: (index: number | null) => void;
  shouldAnimate: boolean | null;
}) {
  return (
    <div className="w-full max-w-[560px] mx-auto mt-[var(--space-6)] mb-[var(--space-4)] px-2">
      <div className="grid grid-cols-2 gap-4 justify-items-center min-[600px]:flex min-[600px]:flex-row min-[600px]:-space-x-[14px] min-[600px]:justify-center min-[600px]:gap-0">
        
        {/* Card 1: Video */}
        <Card
          rotationClass="capability-card-0"
          zIndexClass="z-[1]"
          restingRotation={-2.6}
          onMouseEnter={() => onHoverCard(0)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[80px] w-full rounded-[8px] bg-[#25262E] flex flex-col justify-center items-center gap-1.5 relative overflow-hidden shrink-0">
            {/* Slightly irregular hand-drawn corner-bracket SVG */}
            <svg 
              className="absolute top-1.5 left-1.5 text-[var(--accent-ember)]"
              width="11" 
              height="11" 
              viewBox="0 0 10 10" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.6" 
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8.5 1.5 C5.5 1.1 3.2 1.3 1.5 1.6 C1.3 3.5 1.5 6.0 1.2 8.5" />
            </svg>
            
            {/* Film strip elements */}
            <div className="flex flex-col gap-1.5 w-[36px]">
              <div className="h-[3px] bg-[#9A9AA2]/20 rounded-[1px] w-full" />
              <div className="h-[3px] bg-[#9A9AA2]/20 rounded-[1px] w-full" />
              <div className="h-[3px] bg-[#9A9AA2]/20 rounded-[1px] w-full" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[12px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[12px]">
            Full <span className="italic text-[13px] text-[#F3F2EE]">video</span>
          </h3>

          {/* Description */}
          <p className="text-[10px] text-[#9A9AA2]/85 leading-snug mt-[8px]">
            Original resolution, whatever yt-dlp can pull.
          </p>
        </Card>

        {/* Card 2: Audio */}
        <Card
          rotationClass="capability-card-1"
          zIndexClass="z-[2]"
          restingRotation={0.8}
          onMouseEnter={() => onHoverCard(1)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[80px] w-full rounded-[8px] bg-[#25262E] flex items-center justify-center relative shrink-0">
            <div className="flex items-end gap-[3px] h-[56px] relative">
              {/* 11 waveform bars */}
              <div className="w-[3px] h-[14px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[20px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[28px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[38px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[48px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[56px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[44px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[34px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[24px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[16px] bg-[#3A3B44] rounded-t-sm" />
              <div className="w-[3px] h-[10px] bg-[#3A3B44] rounded-t-sm" />
              
              {/* Scrubber Playhead crossing at ~60% across */}
              <div className="absolute left-[37px] bottom-[-2px] w-[2px] h-[60px] bg-[var(--accent-ember)] z-10">
                <div className="absolute top-[-3px] left-[-2px] w-[6px] h-[6px] rounded-full bg-[var(--accent-ember)]" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[12px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[12px]">
            Audio <span className="italic text-[13px] text-[#F3F2EE]">only</span>
          </h3>

          {/* Description */}
          <p className="text-[10px] text-[#9A9AA2]/85 leading-snug mt-[8px]">
            Strip the video, keep the sound.
          </p>
        </Card>

        {/* Card 3: Thumbnail */}
        <Card
          rotationClass="capability-card-2"
          zIndexClass="z-[3]"
          restingRotation={-1.7}
          onMouseEnter={() => onHoverCard(2)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[80px] w-full rounded-[8px] bg-[#3A2E2A] relative overflow-hidden shrink-0">
            {/* Absolute resolution badge bottom-right with dark scrim & slight rotation */}
            <span 
              className="absolute bottom-1.5 right-1.5 font-mono text-[8px] font-medium text-[#F3F2EE]/90 bg-black/40 px-1 py-0.5 rounded-[2px] leading-none inline-block select-none"
              style={{ transform: "rotate(-2deg)" }}
            >
              1920×1080
            </span>
          </div>

          {/* Title */}
          <h3 className="text-[12px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[12px]">
            Cover <span className="italic text-[13px] text-[#F3F2EE]">thumbnail</span>
          </h3>

          {/* Description */}
          <p className="text-[10px] text-[#9A9AA2]/85 leading-snug mt-[8px]">
            The cover art, original resolution.
          </p>
        </Card>

        {/* Card 4: Metadata */}
        <Card
          rotationClass="capability-card-3"
          zIndexClass="z-[4]"
          restingRotation={2.3}
          onMouseEnter={() => onHoverCard(3)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[80px] w-full rounded-[8px] bg-[#25262E] flex flex-col justify-center gap-1.5 p-2.5 font-mono text-[9px] shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-[#9A9AA2]">title:</span>
              <span className="text-[#F3F2EE]/90">studio-tour</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#9A9AA2]">tags:</span>
              <span className="text-[#F3F2EE]/90">vlog, gear</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[#9A9AA2]">date:</span>
              <span className="text-[#F3F2EE]/90">2026-04-02</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[12px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[12px]">
            Full <span className="italic text-[13px] text-[#F3F2EE]">metadata</span>
          </h3>

          {/* Description */}
          <p className="text-[10px] text-[#9A9AA2]/85 leading-snug mt-[8px]">
            Title, tags, and upload date as a sidecar.
          </p>
        </Card>

      </div>
    </div>
  );
}
