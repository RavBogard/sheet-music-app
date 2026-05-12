import Dexie, { type Table } from 'dexie'

import type {
    LocalEditLog,
    LocalSetlist,
    LocalSong,
    LocalTrack,
    MetaRow,
    OutboxRow,
    Tombstone,
} from './types'

export class LocalDb extends Dexie {
    setlists!: Table<LocalSetlist, string>
    tracks!: Table<LocalTrack, string>
    songs!: Table<LocalSong, string>
    outbox!: Table<OutboxRow, number>
    meta!: Table<MetaRow, string>
    edit_log!: Table<LocalEditLog, number>
    tombstones!: Table<Tombstone, [string, string]>

    constructor(name = 'crc-local') {
        super(name)
        this.version(1).stores({
            setlists: 'id, updatedAt, ownerId, eventDate',
            tracks: 'id, setlistId, [setlistId+order], songId',
            songs: 'id, normalizedTitle',
            outbox: '++localId, status, scheduledFor, [status+scheduledFor]',
            meta: 'key',
        })
        // v2 (v50-04): additive `defaults` + `recent` fields on songs.
        // Stores re-declared verbatim — Dexie carries over indexes across
        // version() calls only when they are explicitly listed. Additive
        // non-indexed fields don't strictly require a version bump, but the
        // explicit version() gives us a hook for future indexed-field
        // additions in v50-05/06.
        this.version(2).stores({
            setlists: 'id, updatedAt, ownerId, eventDate',
            tracks: 'id, setlistId, [setlistId+order], songId',
            songs: 'id, normalizedTitle',
            outbox: '++localId, status, scheduledFor, [status+scheduledFor]',
            meta: 'key',
        })
        // v3 (v5h3-01-02): additive new `edit_log` table for save-loss
        // recurrence auto-capture. ONLY new table; existing tables
        // re-declared verbatim per Dexie's per-version index carryover
        // semantics. Per the v50-04 additive-non-indexed rule, the new
        // table's only index beyond the auto-increment primary key is
        // `ts` (used for FIFO eviction + descending recent-N queries by
        // upload-on-mount). No upgrade callback needed — adding a table
        // is non-destructive and existing rows in other tables are
        // untouched.
        this.version(3).stores({
            setlists: 'id, updatedAt, ownerId, eventDate',
            tracks: 'id, setlistId, [setlistId+order], songId',
            songs: 'id, normalizedTitle',
            outbox: '++localId, status, scheduledFor, [status+scheduledFor]',
            meta: 'key',
            edit_log: '++id, ts',
        })
        // v4 (Bug 2 fix, 2026-05-12): additive `tombstones` table for delete
        // intent durability. See Tombstone in types.ts for rationale. Compound
        // primary key `[collection+docId]` gives O(1) lookup + dedupe; indexed
        // by `deletedAt` to support future TTL prune. Adding a table is
        // non-destructive — no upgrade callback needed; existing rows in
        // other tables are untouched. Existing tables re-declared verbatim
        // per Dexie's per-version index-carryover semantics.
        this.version(4).stores({
            setlists: 'id, updatedAt, ownerId, eventDate',
            tracks: 'id, setlistId, [setlistId+order], songId',
            songs: 'id, normalizedTitle',
            outbox: '++localId, status, scheduledFor, [status+scheduledFor]',
            meta: 'key',
            edit_log: '++id, ts',
            tombstones: '[collection+docId], deletedAt',
        })
    }
}

let _db: LocalDb | null = null

export function getDb(): LocalDb {
    if (!_db) _db = new LocalDb()
    return _db
}

// Test-only: closes and deletes the active DB so each test starts clean.
export async function resetDbForTests(): Promise<void> {
    if (_db) {
        _db.close()
        try {
            await Dexie.delete(_db.name)
        } catch {
            // ignore — fake-indexeddb may have already collected the store
        }
        _db = null
    }
}
