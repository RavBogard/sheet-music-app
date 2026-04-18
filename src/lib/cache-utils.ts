import { hasFile, putFile } from './offline-idb'

/** Is the blob for this file in our offline IDB store? */
export async function isFileCached(fileId: string): Promise<boolean> {
    return hasFile(fileId)
}

/** Download a single file into IDB. Returns true iff the blob was written. */
async function cacheFileForOffline(fileId: string): Promise<boolean> {
    try {
        const res = await fetch(`/api/drive/file/${fileId}`)
        if (!res.ok) return false
        const blob = await res.blob()
        if (!blob || blob.size === 0) return false
        await putFile(fileId, blob)
        return true
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
        const alreadyCached = await hasFile(fileId)
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
