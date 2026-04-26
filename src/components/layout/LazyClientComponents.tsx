"use client"

import dynamic from "next/dynamic"

// Lazy-load components that don't affect initial page render.

const OfflineIndicator = dynamic(
    () => import("@/components/offline/OfflineIndicator").then(m => m.OfflineIndicator),
    { ssr: false }
)

const SwCleanup = dynamic(
    () => import("@/components/offline/SwCleanup").then(m => m.SwCleanup),
    { ssr: false }
)

export function LazyClientComponents() {
    return (
        <>
            <OfflineIndicator />
            <SwCleanup />
        </>
    )
}
