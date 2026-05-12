// Local-first IDB types for the v5.0 sync engine.
// Bound by ARCHITECTURE.md §2 (doc-in-IDB model).

export type LocalCollection = 'setlists' | 'tracks' | 'songs'

export interface LocalSetlist {
    id: string
    updatedAt: number
    ownerId: string
    eventDate?: number
    /** v50-07-03 (Option C Hybrid Lazy Hydration): set to true after the
     *  hydrator fans out the legacy embedded `tracks[]` into the top-level
     *  `tracks/{id}` collection on first edit-open. Optional + non-indexed
     *  per the v50-04 additive-schema rule. */
    hydrated?: boolean
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

/**
 * Tombstone — durable marker that the user intentionally deleted a row.
 *
 * Written in the same Dexie transaction as the physical delete + outbox
 * enqueue (see write.ts). Cleared when the engine successfully drains the
 * delete outbox row (server has acknowledged the delete) OR when the user
 * explicitly re-creates the same docId.
 *
 * Why it exists: deletes can be lost from the outbox via reconciliation
 * choices, dead-letter, or user-discard. Without a tombstone, the next
 * server-priming pass (SetlistGridHydrator or snapshot-listener) sees
 * "local doesn't have it, server does" and resurrects the row. The
 * tombstone makes deletion intent a first-class durable signal,
 * independent of outbox state.
 *
 * Compound primary key `[collection+docId]` inherently dedupes — there
 * can only be one active tombstone per (collection, docId).
 */
export interface Tombstone {
    collection: LocalCollection
    docId: string
    /** ms since epoch. */
    deletedAt: number
    /** Server-confirmed updatedAt the row had at delete time (if known).
     *  Diagnostic only; not consulted by the resurrection guards. */
    originalUpdatedAt?: number
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

// v5h3-01-02: edit-log instrumentation row.
//
// Append-only IDB-persisted breadcrumb for the v5.0 sync substrate's hot
// write paths (see .paul/phases/v5h3-01-save-loss-recurrence). Every write
// path (TextCell.commit, DropdownCell.commit, applyEdit, engine.drainOnce
// per-row, snapshot-listener.handleTracks per-change) records ONE row.
//
// HARD CONTRACT: NO USER-TYPED CONTENT IN ANY FIELD. All fields are stable
// identifiers (ids, opcodes, outcome strings) or timestamps. `payloadKeys`
// is the list of FIELD NAMES touched, never the values. The TextCell /
// DropdownCell call sites pass placeholders ('(text)' / '(dropdown)') so
// the breadcrumb sequence still tells the story without ever touching the
// user's typed value. Anyone adding a field must preserve this rule —
// see the no-PII test in src/lib/sync/__tests__/edit-log.test.ts.
export type EditLogSource =
    | 'text-cell'
    | 'dropdown-cell'
    | 'apply-edit'
    | 'engine-drain'
    | 'snapshot-listener'

export interface LocalEditLog {
    /** Auto-increment primary key assigned by Dexie. */
    id?: number
    /** Wall-clock ms when the entry was recorded. */
    ts: number
    source: EditLogSource
    /** Outbox op for apply-edit / engine-drain rows; outcome verb for
     *  snapshot-listener rows. Always a small fixed string vocabulary. */
    op?: string
    collection?: string
    docId?: string
    cellType?: 'text' | 'dropdown'
    /** Names (NOT values) of fields touched. Cells pass a single
     *  placeholder ('(text)' / '(dropdown)') to avoid leaking aria labels. */
    payloadKeys?: string[]
    /** Outcome string from the call site's vocabulary. See PLAN.md AC-4. */
    outcome?: string
    /** Engine drain attempt counter (used by engine-drain rows). */
    attempts?: number
    /** Local row updatedAt for snapshot-listener guard outcomes. */
    localUpdatedAt?: number
}
