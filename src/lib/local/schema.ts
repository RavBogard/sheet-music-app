import Dexie, { type Table } from 'dexie'

import type {
    LocalSetlist,
    LocalSong,
    LocalTrack,
    MetaRow,
    OutboxRow,
} from './types'

export class LocalDb extends Dexie {
    setlists!: Table<LocalSetlist, string>
    tracks!: Table<LocalTrack, string>
    songs!: Table<LocalSong, string>
    outbox!: Table<OutboxRow, number>
    meta!: Table<MetaRow, string>

    constructor(name = 'crc-local') {
        super(name)
        this.version(1).stores({
            setlists: 'id, updatedAt, ownerId, eventDate',
            tracks: 'id, setlistId, [setlistId+order], songId',
            songs: 'id, normalizedTitle',
            outbox: '++localId, status, scheduledFor, [status+scheduledFor]',
            meta: 'key',
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
