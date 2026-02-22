import { QueueItem } from "@/lib/store"
import { isFileCached } from "@/lib/cache-utils"

/**
 * Prefetch upcoming files in the setlist queue for instant page turns.
 * Uses ServiceWorker / Cache API for consistent offline storage.
 *
 * Called when entering performance mode or advancing to a new song.
 */
export async function prefetchUpcoming(
    queue: QueueItem[],
    currentIndex: number,
    lookahead = 3
): Promise<void> {
    if (!queue.length) return

    const upcoming = queue.slice(currentIndex + 1, currentIndex + 1 + lookahead)
    if (!upcoming.length) return

    for (const item of upcoming) {
        if (!item.fileId || item.fileId.startsWith('flow-')) continue

        // Skip if already cached
        const cached = await isFileCached(item.fileId)
        if (cached) continue

        // Prefetch in background — don't block UI
        try {
            const url = `/api/drive/file/${item.fileId}`
            // Browser service worker captures this automatically
            await fetch(url)
        } catch {
            // Silent fail — prefetch is best-effort
        }
    }
}

/**
 * Check if a specific file is already cached offline.
 */
export async function isFilePrefetched(fileId: string): Promise<boolean> {
    try {
        return await isFileCached(fileId)
    } catch {
        return false
    }
}

/**
 * Pre-cache ALL files in a setlist for offline use during services.
 * Fetches sequentially with small delays to avoid hammering the server.
 *
 * Returns the count of newly cached files.
 */
export async function prefetchSetlistPDFs(
    fileIds: string[],
    onProgress?: (cached: number, total: number) => void
): Promise<number> {
    if (!fileIds.length) return 0

    const unique = [...new Set(fileIds.filter(Boolean))]
    let newlyCached = 0

    for (let i = 0; i < unique.length; i++) {
        const fileId = unique[i]

        // Flow items are synthetic non-song elements, not valid drive IDs
        if (fileId.startsWith('flow-')) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        // Skip if already cached
        const cached = await isFileCached(fileId)
        if (cached) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        try {
            const url = `/api/drive/file/${fileId}`
            const response = await fetch(url)
            if (response.ok) newlyCached++
        } catch {
            // Silent fail — best-effort
        }

        onProgress?.(i + 1, unique.length)

        // Small delay between fetches to avoid overwhelming the connection
        if (i < unique.length - 1) {
            await new Promise(r => setTimeout(r, 100))
        }
    }

    return newlyCached
}
