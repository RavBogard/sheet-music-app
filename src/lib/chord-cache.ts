import { logger } from "@/lib/logger"
/**
 * Client-side chord cache utilities.
 * Checks server cache before running expensive scans,
 * and saves scan results for future use.
 */

// Bump this when scanner logic changes to invalidate stale caches
const CACHE_VERSION = 5

interface CachedChord {
    text: string
    originalText: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
}

interface CacheResult {
    cached: boolean
    data?: {
        chords: CachedChord[]
        scannedAt: string
        scanMethod: 'textLayer' | 'geminiOCR'
        cacheVersion?: number
    }
}

/**
 * Load cached chord positions for a specific page of a file.
 * Returns null if no cache exists or on error.
 */
export async function loadChordCache(
    fileId: string,
    pageNumber: number,
    token: string
): Promise<CachedChord[] | null> {
    try {
        const res = await fetch(
            `/api/library/chord-cache?fileId=${encodeURIComponent(fileId)}&page=${pageNumber}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        )

        if (!res.ok) return null

        const data: CacheResult = await res.json()
        if (data.cached && data.data?.chords && data.data.chords.length > 0) {
            // Skip stale caches from older scanner versions
            if (data.data.cacheVersion && data.data.cacheVersion >= CACHE_VERSION) {
                return data.data.chords
            }
            // Old cache without version — ignore, will be re-scanned
            return null
        }

        return null
    } catch (err) {
        logger.warn('[ChordCache] Load failed:', err)
        return null
    }
}

/**
 * Save scanned chord positions to the server cache.
 * Fire-and-forget — doesn't block the UI.
 */
export function saveChordCache(
    fileId: string,
    pageNumber: number,
    chords: CachedChord[],
    scanMethod: 'textLayer' | 'geminiOCR',
    token: string
): void {
    // Don't cache empty results — the page might not have loaded fully
    if (!chords || chords.length === 0) return

    fetch('/api/library/chord-cache', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            fileId,
            page: pageNumber,
            chords,
            scanMethod,
            cacheVersion: CACHE_VERSION
        })
    }).catch(err => {
        logger.warn('[ChordCache] Save failed:', err)
    })
}

/**
 * Clear cached chord data for a file (e.g., when the PDF is updated).
 */
export async function clearChordCache(
    fileId: string,
    token: string
): Promise<boolean> {
    try {
        const res = await fetch(
            `/api/library/chord-cache?fileId=${encodeURIComponent(fileId)}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            }
        )
        return res.ok
    } catch (err) {
        logger.warn('[ChordCache] Clear failed:', err)
        return false
    }
}
