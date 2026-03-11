"use client"

import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"

export default function PerformLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Allow theme inheritance
    return (
        <div id="main-content" className="min-h-screen">
            {/* PDF worker is loaded from CDN (unpkg) with version pinned to react-pdf's pdfjs */}
            {/* No preload needed — CDN has excellent caching and worker loads fast */}
            <PerformanceOfflineIndicator />
            {children}
        </div>
    )
}
