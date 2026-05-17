"use client"

import dynamic from "next/dynamic"

// Lazy-load components that don't affect initial page render.

const OfflineIndicator = dynamic(
    () => import("@/components/offline/OfflineIndicator").then(m => m.OfflineIndicator),
    { ssr: false }
)

// SwCleanup was removed 2026-05-17. It tried to unregister the legacy
// serwist PWA + clear Firestore IDB + reload, but its IDB-clear racing
// against in-flight Firestore listeners contributed to the refresh-loop
// bug. The serwist PWA is now killed at the build level (see
// next.config.ts) and a self-unregistering tombstone ships at public/sw.js
// for browsers that still have the legacy SW cached.

const SyncEngineBoot = dynamic(
    () => import("@/lib/sync/init").then(m => ({ default: m.SyncEngineBoot })),
    { ssr: false }
)

export function LazyClientComponents() {
    return (
        <>
            <OfflineIndicator />
            <SyncEngineBoot />
        </>
    )
}
