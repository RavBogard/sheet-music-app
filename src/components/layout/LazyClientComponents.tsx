"use client"

import dynamic from "next/dynamic"

// Lazy-load components that don't affect initial page render.
// ChatPanel (383 lines + AI/setlist imports) is the biggest win —
// most users never open it, but it was previously loaded on every page.
const ChatPanel = dynamic(
    () => import("@/components/setlist/ChatPanel").then(m => m.ChatPanel),
    { ssr: false }
)

const OfflineIndicator = dynamic(
    () => import("@/components/offline/OfflineIndicator").then(m => m.OfflineIndicator),
    { ssr: false }
)

const BackgroundPrefetcher = dynamic(
    () => import("@/components/offline/BackgroundPrefetcher").then(m => m.BackgroundPrefetcher),
    { ssr: false }
)

const UpdatePrompt = dynamic(
    () => import("@/components/offline/UpdatePrompt").then(m => m.UpdatePrompt),
    { ssr: false }
)

export function LazyClientComponents() {
    return (
        <>
            <ChatPanel />
            <OfflineIndicator />
            <BackgroundPrefetcher />
            <UpdatePrompt />
        </>
    )
}
