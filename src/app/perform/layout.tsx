"use client"

import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"

export default function PerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Force dark mode for performance/stage use
    return (
        <div className="dark bg-zinc-950 text-white min-h-screen">
            {/* PDF worker is loaded from CDN (unpkg) with version pinned to react-pdf's pdfjs */}
            {/* No preload needed — CDN has excellent caching and worker loads fast */}
            <PerformanceOfflineIndicator />
            {children}
        </div>
    )
}
