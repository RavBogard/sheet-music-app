import { collection, onSnapshot, query, where, type DocumentChange } from 'firebase/firestore'

import { subscribeWithDb, recoverFromFirestoreShutdown } from '@/lib/firebase'
import { getDb, type LocalDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { logger } from '@/lib/logger'
import { rowOrg } from '@/lib/org/membership'
import { DEFAULT_ORG_ID } from '@/lib/org/registry'
import type { OrgId } from '@/lib/org/types'

/**
 * v60-09-01: snapshot-listener adapter — supersedes primeSongsLibrary's
 * one-shot getDocs. The default wraps `onSnapshot(collection(db,'songs'))`;
 * tests inject an in-memory adapter that drives docChanges deterministically.
 */
export interface SubscribeAdapter {
    subscribe(
        handler: (changes: DocChange[]) => void,
        onError: (err: unknown) => void,
        orgId: OrgId,
    ): () => void
}

/** Library-collection doc-change descriptor — provider-agnostic shape that the
 *  emulator test + production Firestore adapter both map to. */
export interface DocChange {
    type: 'added' | 'modified' | 'removed'
    id: string
    data: Partial<LocalSong>
}

export interface SubscribeSongsLibraryOptions {
    db?: LocalDb
    firestore?: SubscribeAdapter
    /**
     * The HOST org (the site this page is on), not the caller's memberships.
     * David's ask 2, 2026-09-22: nearly every account belongs to both
     * tenants, so "what may I read" never narrowed the pickers — on
     * brotherslazaroff.live they listed every CRC chart. Default crc.
     */
    orgId?: OrgId
    /** Signed-in uid. A different account (or org) clears the local table. */
    uid?: string | null
}

/** Dexie meta key recording which org|uid the local songs table belongs to. */
export const SONGS_SCOPE_META_KEY = 'songsScope'

/**
 * Make the local songs table belong to `orgId`/`uid` before the listener
 * fills it. A device that last saw another tenant or account starts empty;
 * rows of another org are dropped even when the scope matches (a stale row
 * must never show on the wrong site).
 */
export async function scopeLocalSongs(localDb: LocalDb, orgId: OrgId, uid: string | null | undefined) {
    const scope = `${orgId}|${uid ?? ''}`
    const prior = await localDb.meta.get(SONGS_SCOPE_META_KEY)
    if (prior && prior.value !== scope) {
        // Another tenant or account used this device: start from nothing.
        await localDb.songs.clear()
        await localDb.meta.put({ key: SONGS_SCOPE_META_KEY, value: scope })
        return
    }
    // First run on a device that predates the scope record: keep its cache
    // (an offline iPad could not refill it) and drop only foreign rows.
    if (!prior) await localDb.meta.put({ key: SONGS_SCOPE_META_KEY, value: scope })
    const foreign = await localDb.songs.filter((s) => rowOrg(s.orgId) !== orgId).primaryKeys()
    if (foreign.length) await localDb.songs.bulkDelete(foreign)
}

const defaultFirestoreAdapter: SubscribeAdapter = {
    subscribe(handler, onError, orgId) {
        return subscribeWithDb((firestoreDb) => {
            // Every songs doc carries orgId (990 of 990, measured 2026-09-22;
            // the writers stamp it). A query for 'crc' cannot match an
            // unstamped doc, which is why the writers must.
            const ref = query(collection(firestoreDb, 'songs'), where('orgId', '==', orgId))
            return onSnapshot(
                ref,
                (snap) => {
                    const changes: DocChange[] = snap.docChanges().map((c: DocumentChange) => ({
                        type: c.type,
                        id: c.doc.id,
                        data: c.doc.data() as Partial<LocalSong>,
                    }))
                    handler(changes)
                },
                (err) => onError(err),
            )
        })
    },
}

/**
 * v60-09-01: continuous Firestore `songs/*` → Dexie `songs` table sync.
 * Replaces primeSongsLibrary's one-shot getDocs; the first snapshot
 * delivers the same population effect, and subsequent snapshots keep the
 * local cache live so Daniel's iPad sees Drive uploads (or rename/archive
 * mutations) from his Mac without a manual reload.
 *
 * Returns an unsubscribe function. Caller is responsible for not
 * double-subscribing (SetlistGridHydrator handles single-mount via ref-guard).
 * Fail-soft: errors during snapshot delivery are warn-logged and the
 * listener stays alive (Firestore auto-recovers from transient disconnects).
 *
 * Writes via direct `db.songs.put` / `db.songs.delete` (NOT applyEdit) —
 * server is authoritative for songs/*; routing through the engine would
 * enqueue circular outbox rows.
 */
export function subscribeSongsLibrary(
    opts?: SubscribeSongsLibraryOptions,
): () => void {
    const localDb = opts?.db ?? getDb()
    const firestore = opts?.firestore ?? defaultFirestoreAdapter
    const orgId = opts?.orgId ?? DEFAULT_ORG_ID

    // A callback that arrives after unsubscribe (an org or account switch)
    // must not write the old tenant's rows into the new tenant's table.
    let live = true
    // Deliveries wait behind the scope reset (and each other), so a clear
    // can never run after, and wipe, rows this listener just wrote.
    let chain: Promise<void> = scopeLocalSongs(localDb, orgId, opts?.uid).catch((err) => {
        logger.warn('[subscribeSongsLibrary] local scope reset failed', err)
    })

    const apply = (changes: DocChange[]) => {
        if (!live) return
        for (const change of changes) {
            if (change.type === 'removed') {
                void localDb.songs.delete(change.id).catch((err) => {
                    logger.warn(`[subscribeSongsLibrary] delete ${change.id} failed`, err)
                })
                continue
            }
            const data = change.data ?? {}
            if (rowOrg(data.orgId) !== orgId) continue
            const title = typeof data.title === 'string' ? data.title : ''
            if (!title.trim()) continue
            const normalizedTitle =
                typeof data.normalizedTitle === 'string'
                    ? data.normalizedTitle
                    : title.toLowerCase()
            void localDb.songs
                .put({
                    ...data,
                    id: change.id,
                    title,
                    normalizedTitle,
                } as LocalSong)
                .catch((err) => {
                    logger.warn(`[subscribeSongsLibrary] put ${change.id} failed`, err)
                })
        }
    }
    const onError = (err: unknown) => {
        if (!recoverFromFirestoreShutdown(err)) {
            logger.warn('[subscribeSongsLibrary] snapshot error (listener stays alive)', err)
        }
    }
    const stop = firestore.subscribe(
        (changes) => {
            chain = chain.then(() => apply(changes))
        },
        onError,
        orgId,
    )
    const unsubscribe = () => {
        live = false
        stop()
    }

    return unsubscribe
}
