export async function isFileCached(fileId: string): Promise<boolean> {
    if (typeof caches === 'undefined') return false

    try {
        const cacheInfos = await caches.keys()

        for (const cacheName of cacheInfos) {
            const cache = await caches.open(cacheName)
            if (await cache.match(`/api/drive/file/${fileId}`)) {
                return true
            }
        }
    } catch {
        // Fallback or ignore
    }

    return false
}

/**
 * Download a single file into the browser cache for offline access.
 * The service worker intercepts fetches and caches responses automatically.
 */
async function cacheFileForOffline(fileId: string): Promise<boolean> {
    try {
        const res = await fetch(`/api/drive/file/${fileId}`)
        return res.ok
    } catch {
        return false
    }
}

/**
 * Cache all files for a setlist with progress reporting.
 * Returns the number of files successfully cached.
 */
export async function cacheSetlistFiles(
    fileIds: string[],
    onProgress?: (cached: number, total: number) => void
): Promise<number> {
    if (fileIds.length === 0) return 0

    let cached = 0
    const total = fileIds.length

    for (const fileId of fileIds) {
        const alreadyCached = await isFileCached(fileId)
        if (alreadyCached) {
            cached++
            onProgress?.(cached, total)
            continue
        }

        const success = await cacheFileForOffline(fileId)
        if (success) cached++
        onProgress?.(cached, total)

        // Small delay between downloads to avoid flooding
        await new Promise(r => setTimeout(r, 150))
    }

    return cached
}
