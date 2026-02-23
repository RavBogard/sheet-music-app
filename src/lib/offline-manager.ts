/**
 * Unified Offline Manager
 *
 * Consolidates two parallel offline systems:
 * 1. Service Worker Cache API (for PDF files via BackgroundPrefetcher)
 * 2. IndexedDB (for library index via library-cache.ts)
 *
 * Provides a single source of truth for what's cached, storage usage,
 * and cache management operations.
 */

import { getCachedLibrary, clearLibraryCache } from "./library-cache"
import { logger } from "./logger"

export interface OfflineStats {
    /** Total estimated storage used in bytes */
    usageBytes: number
    /** Total storage quota in bytes */
    quotaBytes: number
    /** Usage as a percentage (0-100) */
    usagePercent: number
    /** Number of cached PDF files (from Cache API) */
    cachedFileCount: number
    /** Whether the library index is cached in IndexedDB */
    libraryIndexCached: boolean
    /** When the library index was last cached */
    libraryIndexCachedAt: Date | null
}

/**
 * Get comprehensive offline storage statistics.
 */
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

    // Count cached files from Cache API
    try {
        if (typeof caches !== 'undefined') {
            const cacheNames = await caches.keys()
            for (const name of cacheNames) {
                const cache = await caches.open(name)
                const keys = await cache.keys()
                stats.cachedFileCount += keys.filter(
                    req => req.url.includes('/api/drive/file/')
                ).length
            }
        }
    } catch {
        // Cache API not available
    }

    // Check IndexedDB library cache
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

/**
 * Clear all offline caches (both Cache API and IndexedDB).
 */
export async function clearAllOfflineData(): Promise<void> {
    // Clear Cache API entries for drive files
    try {
        if (typeof caches !== 'undefined') {
            const cacheNames = await caches.keys()
            for (const name of cacheNames) {
                const cache = await caches.open(name)
                const keys = await cache.keys()
                for (const req of keys) {
                    if (req.url.includes('/api/drive/file/')) {
                        await cache.delete(req)
                    }
                }
            }
        }
    } catch (err) {
        logger.warn('[Offline] Failed to clear Cache API:', err)
    }

    // Clear IndexedDB library cache
    try {
        await clearLibraryCache()
    } catch (err) {
        logger.warn('[Offline] Failed to clear IndexedDB:', err)
    }
}

/**
 * Get cached file IDs from the Cache API.
 * Useful for showing which specific files are available offline.
 */
export async function getCachedFileIds(): Promise<string[]> {
    const fileIds: string[] = []

    try {
        if (typeof caches === 'undefined') return fileIds

        const cacheNames = await caches.keys()
        for (const name of cacheNames) {
            const cache = await caches.open(name)
            const keys = await cache.keys()
            for (const req of keys) {
                const match = req.url.match(/\/api\/drive\/file\/([^/?]+)/)
                if (match) {
                    fileIds.push(match[1])
                }
            }
        }
    } catch {
        // Cache API not available
    }

    return fileIds
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
