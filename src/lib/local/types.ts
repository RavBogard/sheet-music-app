// Local-first IDB types for the v5.0 sync engine.
// Bound by ARCHITECTURE.md §2 (doc-in-IDB model).

export type LocalCollection = 'setlists' | 'tracks' | 'songs'

export interface LocalSetlist {
    id: string
    updatedAt: number
    ownerId: string
    eventDate?: number
    [key: string]: unknown
}

export interface LocalTrack {
    id: string
    setlistId: string
    order: number
    songId?: string
    title?: string
    key?: string
    bpm?: number
    leadMusician?: string
    /** Last server-confirmed `updatedAt` for this row (ms since epoch).
     *  Written by SyncEngine on commit success (v50-06-01); read by
     *  SetlistGrid + cells to thread `expectedUpdatedAt` precondition into
     *  applyEdit. Undefined for rows that haven't been server-committed
     *  yet (just-created locally) — engine treats undefined as "no
     *  precondition" and the first commit echoes back a real timestamp. */
    updatedAt?: number
    [key: string]: unknown
}

export interface SongDefaults {
    key?: string
    lead?: string
    bpm?: number
}

export interface SongRecentEntry {
    key?: string
    lead?: string
    bpm?: number
    setlistId: string
    performedAt: number
}

export interface LocalSong {
    id: string
    title: string
    normalizedTitle: string
    defaults?: SongDefaults
    recent?: SongRecentEntry[]
    /** v50-06-01: last server-confirmed `updatedAt` (ms). See LocalTrack
     *  for semantics. Songs are written by sticky-memory propagation
     *  (v50-04 helpers) which can also race remote writes. */
    updatedAt?: number
    [key: string]: unknown
}

export type OutboxStatus = 'pending' | 'sending' | 'failed'

export type OutboxOp = 'set' | 'update' | 'delete'

export interface OutboxRow {
    localId?: number
    status: OutboxStatus
    scheduledFor: number
    op: OutboxOp
    collection: LocalCollection
    docId: string
    payload: Record<string, unknown>
    expectedUpdatedAt?: number
    attempts: number
    lastError?: string
    createdAt: number
}

export interface MetaRow {
    key: string
    value: unknown
}

export type EditDescriptor =
    | {
          op: 'set'
          collection: LocalCollection
          doc: Record<string, unknown> & { id: string }
      }
    | {
          op: 'update'
          collection: LocalCollection
          docId: string
          patch: Record<string, unknown>
          expectedUpdatedAt?: number
      }
    | {
          op: 'delete'
          collection: LocalCollection
          docId: string
          expectedUpdatedAt?: number
      }

export class WriteAtomicityError extends Error {
    cause?: unknown
    constructor(message: string, cause?: unknown) {
        super(message)
        this.name = 'WriteAtomicityError'
        this.cause = cause
    }
}
