import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/api-client"
/**
 * Client-side chord cache utilities.
 * Checks server cache before running expensive scans,
 * and saves scan results for future use.
 */

// Bump this when scanner logic changes to invalidate stale caches
const CACHE_VERSION = 6

export type ChordSource = 'textLayer' | 'ai' | 'user'

export interface CachedChord {
    text: string
    originalText: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
    source?: ChordSource
}

interface CacheResult {
    cached: boolean
    data?: {
        chords: CachedChord[]
        scannedAt: string
        scanMethod: 'textLayer' | 'textLayer+ai' | 'ai'
        aiValidated?: boolean
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
): Promise<{ chords: CachedChord[], aiValidated: boolean } | null> {
    try {
        const res = await apiFetch(
            `/api/library/chord-cache?fileId=${encodeURIComponent(fileId)}&page=${pageNumber}`
        )

        if (!res.ok) return null

        const data: CacheResult = await res.json()
        if (data.cached && data.data?.chords && data.data.chords.length > 0) {
            // Skip stale caches from older scanner versions
            // BUT preserve user overrides even from old versions
            if (data.data.cacheVersion && data.data.cacheVersion >= CACHE_VERSION) {
                return {
                    chords: data.data.chords,
                    aiValidated: data.data.aiValidated || false
                }
            }
            // Old cache version — extract user overrides for re-application
            const userOverrides = data.data.chords.filter(c => c.source === 'user')
            if (userOverrides.length > 0) {
                return { chords: userOverrides, aiValidated: false }
            }
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
    scanMethod: 'textLayer' | 'textLayer+ai' | 'ai',
    aiValidated: boolean = false,
): void {
    // Don't cache empty results — the page might not have loaded fully
    if (!chords || chords.length === 0) return

    apiFetch('/api/library/chord-cache', {
        method: 'POST',
        body: JSON.stringify({
            fileId,
            page: pageNumber,
            chords,
            scanMethod,
            aiValidated,
            cacheVersion: CACHE_VERSION
        })
    }).catch(err => {
        logger.warn('[ChordCache] Save failed:', err)
    })
}

/**
 * Save native key to library_index document.
 * Fire-and-forget.
 */
export function saveNativeKey(
    fileId: string,
    nativeKey: string,
    source: 'auto' | 'manual' = 'auto',
): void {
    apiFetch('/api/library/chord-cache', {
        method: 'PATCH',
        body: JSON.stringify({ fileId, nativeKey, nativeKeySource: source })
    }).catch(err => {
        logger.warn('[ChordCache] Native key save failed:', err)
    })
}

/**
 * Save chord verification status.
 * Fire-and-forget.
 */
export function saveVerification(
    fileId: string,
    verifiedBy: string,
): void {
    apiFetch('/api/library/chord-cache', {
        method: 'PATCH',
        body: JSON.stringify({ fileId, chordsVerified: true, chordsVerifiedBy: verifiedBy })
    }).catch(err => {
        logger.warn('[ChordCache] Verification save failed:', err)
    })
}

/**
 * Load native key and verification status for a file.
 */
export async function loadLibraryMeta(
    fileId: string,
): Promise<{ nativeKey?: string; nativeKeySource?: string; chordsVerified?: boolean; chordsVerifiedBy?: string } | null> {
    try {
        const res = await apiFetch(
            `/api/library/chord-cache?fileId=${encodeURIComponent(fileId)}&meta=true`
        )
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

/**
 * Clear cached chord data for a file (e.g., when the PDF is updated).
 */
export async function clearChordCache(
    fileId: string,
): Promise<boolean> {
    try {
        const res = await apiFetch(
            `/api/library/chord-cache?fileId=${encodeURIComponent(fileId)}`,
            { method: 'DELETE' }
        )
        return res.ok
    } catch (err) {
        logger.warn('[ChordCache] Clear failed:', err)
        return false
    }
}
