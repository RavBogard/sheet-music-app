import { collection, onSnapshot, type DocumentChange } from 'firebase/firestore'

import { db as firestoreDb, recoverFromFirestoreShutdown } from '@/lib/firebase'
import { getDb, type LocalDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { logger } from '@/lib/logger'

/**
 * v60-09-01: snapshot-listener adapter — supersedes primeSongsLibrary's
 * one-shot getDocs. The default wraps `onSnapshot(collection(db,'songs'))`;
 * tests inject an in-memory adapter that drives docChanges deterministically.
 */
export interface SubscribeAdapter {
    subscribe(
        handler: (changes: DocChange[]) => void,
        onError: (err: unknown) => void,
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
}

const defaultFirestoreAdapter: SubscribeAdapter = {
    subscribe(handler, onError) {
        const ref = collection(firestoreDb, 'songs')
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

    const unsubscribe = firestore.subscribe(
        (changes) => {
            for (const change of changes) {
                if (change.type === 'removed') {
                    void localDb.songs.delete(change.id).catch((err) => {
                        logger.warn(`[subscribeSongsLibrary] delete ${change.id} failed`, err)
                    })
                    continue
                }
                const data = change.data ?? {}
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
        },
        (err) => {
            logger.warn('[subscribeSongsLibrary] snapshot error (listener stays alive)', err)
            recoverFromFirestoreShutdown(err)
        },
    )

    return unsubscribe
}
