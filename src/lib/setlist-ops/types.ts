/**
 * Setlist ops contract (docs/planning/2026-11-03-setlist-sync-structural/OPS-CONTRACT.md).
 *
 * One request is one batch of ops, applied in order and committed in ONE
 * Firestore transaction. Row and setlist fields are open records: the engine
 * knows only the fields it owns (see RESERVED_*), everything else is the
 * author's and is merged field by field.
 */

export type RowFields = Record<string, unknown>
export type SetlistFields = Record<string, unknown>

export type Op =
    | { kind: "insert"; rowId: string; afterRowId: string | null; beforeRowId: string | null; row: RowFields }
    | { kind: "remove"; rowId: string }
    | { kind: "move"; rowId: string; afterRowId: string | null; beforeRowId: string | null }
    | { kind: "editRow"; rowId: string; set: Partial<RowFields>; base: Partial<RowFields> }
    | { kind: "editSetlist"; set: Partial<SetlistFields>; base: Partial<SetlistFields> }

export interface OpsRequest {
    /** Idempotency key. A repeat returns the first result. */
    clientBatchId: string
    /** Setlist version the client last saw. Informational: ops rebase, they do not gate. */
    baseVersion: number
    ops: Op[]
}

export type ConflictReason = "row-gone" | "row-exists" | "field"

export interface OpConflict {
    opIndex: number
    reason: ConflictReason
    field?: string
    server?: unknown
    mine?: unknown
}

export interface OpsOk {
    ok: true
    version: number
    applied: number[]
    conflicts: OpConflict[]
    /** Every touched row after the write (inserted, edited or renumbered). */
    rows: Array<Record<string, unknown> & { id: string }>
    /** Rows this batch removed. Not in the contract's minimum; added so a client can drop them. */
    removed: string[]
    /** True when this is a stored answer to a repeated clientBatchId. */
    replayed?: boolean
}

export type RefusalReason = "forbidden" | "not-found" | "invalid" | "too-large"

export interface OpsRefusal {
    ok: false
    reason: RefusalReason
    message?: string
}

export type OpsResult = OpsOk | OpsRefusal

export const REFUSAL_STATUS: Record<RefusalReason, number> = {
    forbidden: 403,
    "not-found": 404,
    invalid: 400,
    "too-large": 413,
}

/** Fields on a row that only the engine writes. Dropped from `row` and `set`. */
export const RESERVED_ROW_FIELDS: ReadonlySet<string> = new Set([
    "id",
    "setlistId",
    "orgId",
    "order",
    "version",
    "updatedAt",
    "createdAt",
    "lastModifiedAt",
    "lastModifiedBy",
    "opBatchId",
])

/**
 * 2026-11-03: provenance of a bpm filled from a recording. Written only by
 * apply_recording_tempos (a patch that carries `bpmSource`); a client may not
 * send them, any other bpm write clears them (SetlistWriter.updateTrack), and a
 * server-side copy (copyableRow, clone_setlist) carries them.
 */
export const BPM_MARKER_FIELDS = ["bpmSource", "bpmSourceRecordingId", "bpmSourceValue"] as const

/** Row fields a client may never send: the engine's own plus the bpm marker. */
export const CLIENT_REFUSED_ROW_FIELDS: ReadonlySet<string> = new Set([...RESERVED_ROW_FIELDS, ...BPM_MARKER_FIELDS])

/** Fields on a setlist that only the server writes. Dropped from editSetlist `set`. */
export const RESERVED_SETLIST_FIELDS: ReadonlySet<string> = new Set([
    "id",
    "orgId",
    "ownerId",
    "version",
    "updatedAt",
    "createdAt",
    "lastModifiedAt",
    "lastModifiedBy",
    "trackCount",
    "songCount",
    "fileIds",
])

/** Max ops per request. A setlist has ~30 rows; a whole-list reorder is n moves. */
export const MAX_OPS = 300
/** Firestore allows 500 writes per transaction; keep headroom for setlist + receipt. */
export const MAX_WRITES = 480
/** The idempotency receipt is kept this long (Firestore TTL policy on `expiresAt`). */
export const OP_BATCH_TTL_MS = 24 * 60 * 60 * 1000
