/**
 * Unified Offline Manager.
 *
 * Single source of truth backed by IndexedDB:
 *  - blob storage for PDF/audio files (offline-idb.ts)
 *  - library index cache (library-cache.ts)
 *
 * v4.2 Phase 1.2: the old Cache API / service worker path is gone. Stats
 * and listings read from IDB only.
 */

import { getCachedLibrary, clearLibraryCache } from "./library-cache"
import { clearAll as clearOfflineBlobs, listFileIds, totalBytes } from "./offline-idb"
import { logger } from "./logger"

export interface OfflineStats {
    /** Total estimated storage used in bytes */
    usageBytes: number
    /** Total storage quota in bytes */
    quotaBytes: number
    /** Usage as a percentage (0-100) */
    usagePercent: number
    /** Number of cached PDF/audio files (from IDB blob store) */
    cachedFileCount: number
    /** Whether the library index is cached in IndexedDB */
    libraryIndexCached: boolean
    /** When the library index was last cached */
    libraryIndexCachedAt: Date | null
}

export async function getOfflineStats(): Promise<OfflineStats> {
    const stats: OfflineStats = {
        usageBytes: 0,
        quotaBytes: 0,
        usagePercent: 0,
        cachedFileCount: 0,
        libraryIndexCached: false,
        libraryIndexCachedAt: null,
    }

    // Storage estimate (overall browser storage)
    try {
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate()
            stats.usageBytes = estimate.usage || 0
            stats.quotaBytes = estimate.quota || 0
            stats.usagePercent = stats.quotaBytes > 0
                ? Math.round((stats.usageBytes / stats.quotaBytes) * 100)
                : 0
        }
    } catch {
        // Storage API not available
    }

    // Count cached files from IDB blob store (ground truth)
    try {
        const ids = await listFileIds()
        stats.cachedFileCount = ids.length
        // If the browser-level estimate is unavailable, fall back to summing
        // known blob sizes so the UI still has a real number.
        if (stats.usageBytes === 0) {
            stats.usageBytes = await totalBytes()
        }
    } catch {
        // IDB not available
    }

    // Check IndexedDB library-index cache
    try {
        const lib = await getCachedLibrary()
        if (lib) {
            stats.libraryIndexCached = true
            stats.libraryIndexCachedAt = lib.cachedAt ? new Date(lib.cachedAt) : null
        }
    } catch {
        // IndexedDB not available
    }

    return stats
}

/** Clear all offline data (blob store + library index). */
export async function clearAllOfflineData(): Promise<void> {
    try {
        await clearOfflineBlobs()
    } catch (err) {
        logger.warn('[Offline] Failed to clear blob store:', err)
    }
    try {
        await clearLibraryCache()
    } catch (err) {
        logger.warn('[Offline] Failed to clear library index:', err)
    }
}

/** Get cached file IDs from the IDB blob store. */
export async function getCachedFileIds(): Promise<string[]> {
    try {
        return await listFileIds()
    } catch {
        return []
    }
}

/** Format bytes into a human-readable string. */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
