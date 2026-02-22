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
