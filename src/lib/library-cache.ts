/**
 * IndexedDB cache layer for the library index.
 * Provides instant (<50ms) library loads on repeat visits.
 * 
 * Uses the `idb` library (already a project dependency) for a
 * promise-based IndexedDB API.
 * 
 * Schema:
 *   database: 'centralreform'
 *   store: 'library' — key 'index' holds { files, lastModified, cachedAt }
 */

import { openDB, type IDBPDatabase } from 'idb'
import { DriveFile } from '@/types/models'
import { logger } from '@/lib/logger'

const DB_NAME = 'centralreform'
const DB_VERSION = 1
const STORE_NAME = 'library'
const INDEX_KEY = 'index'

interface CachedLibrary {
    files: DriveFile[]
    lastModified: string   // ISO timestamp from the API
    cachedAt: number       // Date.now() when cached
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME)
                }
            },
        })
    }
    return dbPromise
}

/**
 * Read cached library from IndexedDB.
 * Returns null if no cache exists or if the cache is corrupted.
 */
export async function getCachedLibrary(): Promise<CachedLibrary | null> {
    try {
        if (typeof window === 'undefined') return null
        const db = await getDB()
        const cached = await db.get(STORE_NAME, INDEX_KEY)
        if (cached?.files && Array.isArray(cached.files)) {
            return cached as CachedLibrary
        }
        return null
    } catch (err) {
        logger.warn('IndexedDB read failed:', err)
        return null
    }
}

/**
 * Write library data to IndexedDB cache.
 */
export async function setCachedLibrary(files: DriveFile[], lastModified: string): Promise<void> {
    try {
        if (typeof window === 'undefined') return
        const db = await getDB()
        const data: CachedLibrary = {
            files,
            lastModified,
            cachedAt: Date.now(),
        }
        await db.put(STORE_NAME, data, INDEX_KEY)
    } catch (err) {
        logger.warn('IndexedDB write failed:', err)
    }
}

/**
 * Get just the cached lastModified timestamp (for staleness check without loading full data).
 */
export async function getCachedTimestamp(): Promise<string | null> {
    try {
        if (typeof window === 'undefined') return null
        const db = await getDB()
        const cached = await db.get(STORE_NAME, INDEX_KEY)
        return cached?.lastModified || null
    } catch {
        return null
    }
}

/**
 * Clear the library cache (used by admin after sync).
 */
export async function clearLibraryCache(): Promise<void> {
    try {
        if (typeof window === 'undefined') return
        const db = await getDB()
        await db.delete(STORE_NAME, INDEX_KEY)
    } catch (err) {
        logger.warn('IndexedDB clear failed:', err)
    }
}
