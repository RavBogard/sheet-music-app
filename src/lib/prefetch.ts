import { QueueItem } from "@/lib/store"
import { hasFile, putFile } from "@/lib/offline-idb"

/**
 * Prefetch upcoming files in the setlist queue into the IDB blob store
 * for instant page turns AND real offline availability.
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
        if (await hasFile(item.fileId)) continue

        try {
            const res = await fetch(`/api/drive/file/${item.fileId}`)
            if (!res.ok) continue
            const blob = await res.blob()
            if (blob && blob.size > 0) await putFile(item.fileId, blob)
        } catch {
            // Silent fail — prefetch is best-effort
        }
    }
}

/** Check if a specific file is already available offline. */
export async function isFilePrefetched(fileId: string): Promise<boolean> {
    try {
        return await hasFile(fileId)
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

        if (fileId.startsWith('flow-')) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        if (await hasFile(fileId)) {
            onProgress?.(i + 1, unique.length)
            continue
        }

        try {
            const res = await fetch(`/api/drive/file/${fileId}`)
            if (res.ok) {
                const blob = await res.blob()
                if (blob && blob.size > 0) {
                    await putFile(fileId, blob)
                    newlyCached++
                }
            }
        } catch {
            // Silent fail — best-effort
        }

        onProgress?.(i + 1, unique.length)

        if (i < unique.length - 1) {
            await new Promise(r => setTimeout(r, 100))
        }
    }

    return newlyCached
}
