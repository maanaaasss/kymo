import { useState } from "react";
import { Link as LinkIcon, Download, CheckCircle2 } from "lucide-react";
import { useBasketStore } from "@/lib/store/basket";

interface ChannelHeaderProps {
  title: string;
  videoCount: number;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  handle?: string | null;
  subscriberCount?: number | null;
  description?: string | null;
  verified?: boolean;
  onReset?: () => void;
}

/**
 * Channel header — displays channel banner, avatar, verification status, and video count.
 * Adheres to Section 3.2 typography and spacing tokens.
 */
export function ChannelHeader({
  title,
  videoCount,
  thumbnailUrl,
  bannerUrl,
  verified = false,
  onReset,
}: ChannelHeaderProps) {
  const [imgError, setImgError] = useState(false);
  const add = useBasketStore((s) => s.add);

  const downloadImageDirectly = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // Fallback: open in new tab if CORS restricts direct client-side fetch
      window.open(url, "_blank");
    }
  };

  const handleDownloadBanner = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!bannerUrl) return;
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
    downloadImageDirectly(bannerUrl, `${sanitizedTitle}_banner.jpg`);
  };

  const handleDownloadAvatar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!thumbnailUrl) return;
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_");
    downloadImageDirectly(thumbnailUrl, `${sanitizedTitle}_avatar.jpg`);
  };

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="mx-auto max-w-[1200px] px-[var(--space-5)] pt-[var(--space-3)] pb-[var(--space-4)]">
        {/* Top Nav Bar */}
        {onReset && (
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] transition-all duration-[140ms] ease-out cursor-pointer"
              aria-label="Back to landing page"
            >
              <LinkIcon size={11} />
              Paste another link
            </button>
          </div>
        )}

        <div className="relative flex flex-col">
          {/* Banner */}
          <div className="relative w-full h-[100px] sm:h-[200px] rounded-t-[12px] overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)] group/banner">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt=""
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-[var(--bg-surface-raised)]" />
            )}

            {bannerUrl && (
              <button
                onClick={handleDownloadBanner}
                className="absolute right-[var(--space-3)] top-[var(--space-3)] z-10 flex items-center justify-center w-[28px] h-[28px] rounded-[var(--radius-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/60 bg-black/40 transition-all duration-[140ms] ease-out backdrop-blur-sm border border-white/10 opacity-100 sm:opacity-0 sm:group-hover/banner:opacity-100 cursor-pointer"
                title="Download banner"
              >
                <Download size={14} />
              </button>
            )}
          </div>

          {/* Identity block */}
          <div className="flex flex-row items-end gap-[var(--space-4)] px-4 sm:px-8 pb-[var(--space-2)] -mt-[40px] sm:-mt-[64px] relative z-10 text-left">
            {/* Avatar container */}
            <div className="relative shrink-0 group/avatar">
              <div className="w-[80px] h-[80px] sm:w-[128px] sm:h-[128px] rounded-full overflow-hidden border-[4px] border-[var(--bg-canvas)] bg-[var(--bg-canvas)] shadow-md">
                {thumbnailUrl && !imgError ? (
                  <img
                    src={thumbnailUrl}
                    alt={title}
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--bg-surface-raised)] flex items-center justify-center text-[var(--text-secondary)] font-medium text-xs">
                    {title.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              {thumbnailUrl && !imgError && (
                <button
                  onClick={handleDownloadAvatar}
                  className="absolute -bottom-1 -right-1 z-10 flex items-center justify-center w-[30px] h-[30px] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] transition-all duration-[140ms] ease-out opacity-100 sm:opacity-0 sm:group-hover/avatar:opacity-100 shadow-sm cursor-pointer"
                  title="Download avatar"
                >
                  <Download size={14} />
                </button>
              )}
            </div>

            {/* Info block */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-start gap-1.5 flex-wrap">
                <h1 className="text-[18px] font-medium text-[var(--text-primary)] leading-tight">
                  {title}
                </h1>
                {verified && (
                  <CheckCircle2
                    size={14}
                    className="fill-[var(--text-secondary)] text-[var(--bg-surface)] shrink-0"
                  />
                )}
              </div>

              <div className="mt-1 text-[12px] text-[var(--text-secondary)] leading-tight">
                <span className="mono-num">{videoCount}</span> videos
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
