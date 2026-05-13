// v60-09-01: superseded by subscribeSongsLibrary (./subscribe.ts). Retained
// as a test seam — v53-02-01 tests inject `primeSongsLibrary={spy}` and we
// don't force a rewrite. Production call sites flipped at SetlistGridHydrator
// + ChartBindDialog; the helper here no longer fires at runtime.

import { collection, getDocs } from 'firebase/firestore'

import { db as firestoreDb } from '@/lib/firebase'
import { getDb, type LocalDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { logger } from '@/lib/logger'

/**
 * v53-02-01: minimal injection seam over Firestore's `getDocs(collection(db,
 * 'songs'))`. Test runs replace this with an in-memory adapter; production
 * uses the default below. Keeping the surface narrow (`getAllSongs()`)
 * means the helper never needs to know about Firestore types beyond what
 * the default wrapper hands back.
 */
export interface PrimeAdapter {
    getAllSongs(): Promise<Array<{ id: string; data: Partial<LocalSong> }>>
}

export interface PrimeSongsLibraryOptions {
    db?: LocalDb
    firestore?: PrimeAdapter
    /** Optional cap. When set, only the first N adapter rows are written. */
    limit?: number
}

/**
 * v53-02-01: default Firestore adapter. One-shot `getDocs` over the songs
 * collection — NOT a snapshot listener. Cross-device freshness is deferred
 * to v5.4 per Harness Fidelity Gate waiver in v53-02-01-PLAN.md.
 */
const defaultFirestoreAdapter: PrimeAdapter = {
    async getAllSongs() {
        const snap = await getDocs(collection(firestoreDb, 'songs'))
        return snap.docs.map((d) => ({
            id: d.id,
            data: d.data() as Partial<LocalSong>,
        }))
    },
}

/**
 * v53-02-01: best-effort priming of the local Dexie `songs` table from
 * Firestore so ChartBindPopover has a hydrated dataset to filter against
 * on the user's first session open. Fail-soft per v50-07-05 instrumentation
 * discipline — the picker degrades to whatever Dexie already has if the
 * remote read errors. Never throws to the caller.
 *
 * Writes via direct `db.songs.put` (NOT applyEdit) because the remote read
 * is server-authoritative; routing through the engine would enqueue
 * outbox rows and re-send the same payload back to Firestore.
 */
export async function primeSongsLibrary(
    opts?: PrimeSongsLibraryOptions,
): Promise<{ written: number }> {
    const localDb = opts?.db ?? getDb()
    const firestore = opts?.firestore ?? defaultFirestoreAdapter
    const limit = opts?.limit

    try {
        const all = await firestore.getAllSongs()
        const slice =
            typeof limit === 'number' && limit >= 0
                ? all.slice(0, limit)
                : all

        let written = 0
        for (const row of slice) {
            const data = row.data ?? {}
            const title = typeof data.title === 'string' ? data.title : ''
            if (!title.trim()) continue
            const normalizedTitle =
                typeof data.normalizedTitle === 'string'
                    ? data.normalizedTitle
                    : title.toLowerCase()
            await localDb.songs.put({
                ...data,
                id: row.id,
                title,
                normalizedTitle,
            } as LocalSong)
            written += 1
        }
        return { written }
    } catch (err) {
        logger.warn('[primeSongsLibrary] failed', err)
        return { written: 0 }
    }
}
