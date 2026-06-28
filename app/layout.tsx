import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { LenisProvider } from "@/components/providers/LenisProvider";
import { BasketDock } from "@/components/basket/BasketDock";
import { DownloadProgress } from "@/components/download/DownloadProgress";
import { QueuedToast } from "@/components/download/QueuedToast";
import "./globals.css";

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kymo.download"),
  title: "Kymo — YouTube bulk downloader",
  description:
    "Browse channels, select videos, and download them in bulk. A personal-use tool for managing YouTube downloads.",
  keywords: [
    "YouTube bulk downloader",
    "YouTube downloader",
    "bulk download YouTube videos",
    "channel downloader",
    "YouTube playlist downloader",
    "YouTube to mp3",
    "YouTube to mp4",
    "Kymo",
    "media downloader",
    "yt-dlp web interface"
  ],
  authors: [{ name: "maanaaasss", url: "https://github.com/maanaaasss" }],
  creator: "maanaaasss",
  publisher: "Kymo",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://kymo.download",
    title: "Kymo — YouTube bulk downloader",
    description:
      "Browse channels, select videos, and download them in bulk. A personal-use tool for managing YouTube downloads.",
    siteName: "Kymo",
    images: [
      {
        url: "https://kymo.download/og-image.png",
        width: 1200,
        height: 630,
        alt: "Kymo — YouTube bulk downloader",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kymo — YouTube bulk downloader",
    description:
      "Browse channels, select videos, and download them in bulk. A personal-use tool for managing YouTube downloads.",
    creator: "@maanaaasss",
    images: ["https://kymo.download/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] relative">
        <svg 
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.05,
            mixBlendMode: "overlay",
            pointerEvents: "none",
            zIndex: 9999
          }}
        >
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        <QueryProvider>
          <LenisProvider>
            {children}
          </LenisProvider>
          <DownloadProgress />
          <Suspense fallback={null}>
            <BasketDock />
          </Suspense>
          <QueuedToast />
        </QueryProvider>
      </body>
    </html>
  );
}
