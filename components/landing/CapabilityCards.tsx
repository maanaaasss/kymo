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
      onClick={(e) => e.currentTarget.blur()}
      className={`
        card-animation-target ${initClass}
        w-[96px] sm:w-[148px] h-[132px] sm:h-[190px] rounded-[10px] sm:rounded-[12px]
        bg-[var(--bg-surface)] border border-[var(--border-default)]
        select-none relative overflow-hidden box-border
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
      <div className="relative z-10 flex flex-col h-full p-[13px] box-border">
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
    <div className="w-full max-w-[560px] mx-auto mt-[var(--space-5)] mb-[var(--space-3)] px-2">
      <div className="flex flex-row -space-x-[16px] sm:-space-x-[14px] justify-center items-center w-full gap-0 select-none">
        
        {/* Card 1: Video */}
        <Card
          rotationClass="capability-card-0"
          zIndexClass="z-[1]"
          restingRotation={-2}
          onMouseEnter={() => onHoverCard(0)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[46px] sm:h-[80px] w-full rounded-[6px] sm:rounded-[8px] bg-[#2A241C] flex flex-col justify-center items-center gap-1 relative overflow-hidden shrink-0 pointer-events-none">
            {/* Viewfinder corner marks on all four corners */}
            <svg 
              className="absolute top-2 left-2 text-[var(--accent-ember)] pointer-events-none"
              width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M1 6V1H6" />
            </svg>
            <svg 
              className="absolute top-2 right-2 text-[var(--accent-ember)] pointer-events-none"
              width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M7 6V1H2" />
            </svg>
            <svg 
              className="absolute bottom-2 left-2 text-[var(--accent-ember)] pointer-events-none"
              width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M1 2V7H6" />
            </svg>
            <svg 
              className="absolute bottom-2 right-2 text-[var(--accent-ember)] pointer-events-none"
              width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M7 2V7H2" />
            </svg>
            
            {/* Centered play-triangle icon (filled, ~26px, muted gray #5A5246) */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="#5A5246"
              stroke="#5A5246"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="select-none"
            >
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-[10px] sm:text-[14px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[6px] sm:mt-[12px]">
            Full video
          </h3>

          {/* Description */}
          <p className="text-[8px] sm:text-[10px] text-[#9A9AA2]/85 leading-snug mt-[3px] sm:mt-[8px] line-clamp-2">
            Original resolution, whatever yt-dlp can pull.
          </p>
        </Card>

        {/* Card 2: Audio */}
        <Card
          rotationClass="capability-card-1"
          zIndexClass="z-[2]"
          restingRotation={1.5}
          onMouseEnter={() => onHoverCard(1)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[46px] sm:h-[80px] w-full rounded-[6px] sm:rounded-[8px] bg-[#1F2E26] relative shrink-0 overflow-hidden pointer-events-none">
            <svg viewBox="0 0 132 80" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              <rect x="26" y="36" width="3" height="8" rx="1.5" fill="#3D5048"/>
              <rect x="32" y="33" width="3" height="14" rx="1.5" fill="#3D5048"/>
              <rect x="38" y="28" width="3" height="24" rx="1.5" fill="#3D5048"/>
              <rect x="44" y="21" width="3" height="38" rx="1.5" fill="#3D5048"/>
              <rect x="50" y="30" width="3" height="20" rx="1.5" fill="#3D5048"/>
              <rect x="56" y="24" width="3" height="32" rx="1.5" fill="#3D5048"/>
              <rect x="62" y="16" width="3" height="48" rx="1.5" fill="#E2692F"/>
              <rect x="68" y="10" width="3" height="60" rx="1.5" fill="#E2692F"/>
              <rect x="74" y="15" width="3" height="50" rx="1.5" fill="#E2692F"/>
              <rect x="80" y="26" width="3" height="28" rx="1.5" fill="#3D5048"/>
              <rect x="86" y="20" width="3" height="40" rx="1.5" fill="#3D5048"/>
              <rect x="92" y="23" width="3" height="34" rx="1.5" fill="#3D5048"/>
              <rect x="98" y="29" width="3" height="22" rx="1.5" fill="#3D5048"/>
              <rect x="104" y="32" width="3" height="16" rx="1.5" fill="#3D5048"/>
              <rect x="110" y="35" width="3" height="10" rx="1.5" fill="#3D5048"/>
              <rect x="116" y="37" width="3" height="6" rx="1.5" fill="#3D5048"/>
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-[10px] sm:text-[14px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[6px] sm:mt-[12px]">
            Audio only
          </h3>

          {/* Description */}
          <p className="text-[8px] sm:text-[10px] text-[#9A9AA2]/85 leading-snug mt-[3px] sm:mt-[8px] line-clamp-2">
            Strip the video, keep the sound.
          </p>
        </Card>

        {/* Card 3: Thumbnail */}
        <Card
          rotationClass="capability-card-2"
          zIndexClass="z-[3]"
          restingRotation={1}
          onMouseEnter={() => onHoverCard(2)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[46px] sm:h-[80px] w-full rounded-[6px] sm:rounded-[8px] bg-[#3A2E22] relative overflow-hidden shrink-0 pointer-events-none">
            {/* Custom SVG image/thumbnail picture representation */}
            <svg viewBox="0 0 132 80" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              {/* Thumbnail card frame */}
              <rect x="36" y="22" width="60" height="36" rx="4" stroke="#5A5246" strokeWidth="1.5" fill="none" />
              {/* Sun */}
              <circle cx="50" cy="31" r="3" fill="#E2692F" />
              {/* Mountain 1 */}
              <polygon points="37,57 54,39 68,57" fill="#5A5246" opacity="0.6" />
              {/* Mountain 2 */}
              <polygon points="52,57 74,44 95,57" fill="#5A5246" />
            </svg>

            {/* Absolute resolution badge bottom-right with dark scrim & slight rotation */}
            <span 
              className="absolute bottom-1 sm:bottom-1.5 right-1 sm:right-1.5 font-mono text-[6px] sm:text-[8px] font-medium text-[#F3F2EE]/90 bg-black/40 px-1 py-0.5 rounded-[2px] leading-none inline-block select-none"
              style={{ transform: "rotate(-2deg)" }}
            >
              1920×1080
            </span>
          </div>

          {/* Title */}
          <h3 className="text-[10px] sm:text-[14px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[6px] sm:mt-[12px]">
            Cover thumbnail
          </h3>

          {/* Description */}
          <p className="text-[8px] sm:text-[10px] text-[#9A9AA2]/85 leading-snug mt-[3px] sm:mt-[8px] line-clamp-2">
            The cover art, original resolution.
          </p>
        </Card>

        {/* Card 4: Metadata */}
        <Card
          rotationClass="capability-card-3"
          zIndexClass="z-[4]"
          restingRotation={-1.5}
          onMouseEnter={() => onHoverCard(3)}
          onMouseLeave={() => onHoverCard(null)}
          shouldAnimate={shouldAnimate}
        >
          {/* Visual Area */}
          <div className="h-[46px] sm:h-[80px] w-full rounded-[6px] sm:rounded-[8px] bg-[#25201A] flex flex-col justify-center gap-0.5 sm:gap-1.5 p-1.5 sm:p-2.5 font-mono text-[6px] sm:text-[9px] shrink-0 pointer-events-none">
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
          <h3 className="text-[10px] sm:text-[14px] font-sans font-medium text-[#F3F2EE] leading-tight mt-[6px] sm:mt-[12px]">
            Full metadata
          </h3>

          {/* Description */}
          <p className="text-[8px] sm:text-[10px] text-[#9A9AA2]/85 leading-snug mt-[3px] sm:mt-[8px] line-clamp-2">
            Title, tags, and upload date as a sidecar.
          </p>
        </Card>

      </div>
    </div>
  );
}
