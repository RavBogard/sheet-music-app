import { QueueItem } from "@/lib/store"

/**
 * Prefetch upcoming files in the setlist queue for instant page turns.
 * Uses the browser's Cache API (same cache Workbox uses) so fetched files
 * are available offline and don't need to be re-fetched.
 *
 * Called when entering performance mode or advancing to a new song.
 */
export async function prefetchUpcoming(
    queue: QueueItem[],
    currentIndex: number,
    lookahead = 3
): Promise<void> {
    if (!queue.length || !('caches' in window)) return

    const upcoming = queue.slice(currentIndex + 1, currentIndex + 1 + lookahead)
    if (!upcoming.length) return

    // Use the same cache name as Workbox's runtime caching
    const cache = await caches.open('sheet-music-pdfs')

    for (const item of upcoming) {
        if (!item.fileId) continue

        // Build the URL that the app would normally fetch
        const url = `/api/drive/file/${item.fileId}`

        // Skip if already cached
        const existing = await cache.match(url)
        if (existing) continue

        // Prefetch in background — don't block UI
        try {
            const response = await fetch(url)
            if (response.ok) {
                await cache.put(url, response)
            }
        } catch {
            // Silent fail — prefetch is best-effort
        }
    }
}

/**
 * Check if a specific file is already cached.
 */
export async function isFilePrefetched(fileId: string): Promise<boolean> {
    if (!('caches' in window)) return false

    try {
        const cache = await caches.open('sheet-music-pdfs')
        const response = await cache.match(`/api/drive/file/${fileId}`)
        return !!response
    } catch {
        return false
    }
}
