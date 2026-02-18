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
            <PerformanceOfflineIndicator />
            {children}
        </div>
    )
}
