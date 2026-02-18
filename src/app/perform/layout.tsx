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
            {/* Preload PDF.js worker so it's ready before PDFViewer mounts */}
            <link rel="preload" href="/pdf.worker.min.mjs" as="script" />
            <PerformanceOfflineIndicator />
            {children}
        </div>
    )
}
