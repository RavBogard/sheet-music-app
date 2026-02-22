import { QueueItem } from "@/lib/store"
import { isFileOffline, saveOfflineFile } from "@/lib/offline-store"

/**
 * Prefetch upcoming files in the setlist queue for instant page turns.
 * Uses IndexedDB (via offline-store) for consistent offline storage.
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
        const cached = await isFileOffline(item.fileId)
        if (cached) continue

        // Prefetch in background — don't block UI
        try {
            const url = `/api/drive/file/${item.fileId}`
            const response = await fetch(url)
            if (response.ok) {
                const blob = await response.blob()
                await saveOfflineFile(
                    item.fileId,
                    blob,
                    item.name || item.fileId,
                    response.headers.get('content-type') || 'application/pdf'
                )
            }
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
        return await isFileOffline(fileId)
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
        const cached = await isFileOffline(fileId)
        if (cached) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        try {
            const url = `/api/drive/file/${fileId}`
            const response = await fetch(url)
            if (response.ok) {
                const blob = await response.blob()
                await saveOfflineFile(
                    fileId,
                    blob,
                    fileId,
                    response.headers.get('content-type') || 'application/pdf'
                )
                newlyCached++
            }
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
