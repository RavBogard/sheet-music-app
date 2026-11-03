import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { deriveSetlistCounts } from "@/lib/setlist-derived-counts"
import { rowOrg } from "@/lib/mcp/org-context"
import { readVersion } from "@/lib/mcp/error-envelopes"
import { readMembershipRole } from "@/lib/org/access"
import type { OrgId } from "@/lib/org/types"
import {
    canonicalSort,
    cleanRowPayload,
    mergeFields,
    placementIndex,
    stripUndefined,
} from "./pure"
import { runSetlistTransaction, setlistRef, trackRef, TRACKS } from "./writer"
import {
    MAX_OPS,
    MAX_WRITES,
    OP_BATCH_TTL_MS,
    RESERVED_ROW_FIELDS,
    RESERVED_SETLIST_FIELDS,
    type Op,
    type OpConflict,
    type OpsOk,
    type OpsRefusal,
    type OpsRequest,
    type OpsResult,
} from "./types"

type DB = FirebaseFirestore.Firestore

export const OP_BATCHES = "opBatches"

const ID_RE = /^[^/]{1,200}$/

const refuse = (reason: OpsRefusal["reason"], message?: string): OpsRefusal => ({
    ok: false,
    reason,
    ...(message ? { message } : {}),
})

// ── validation ─────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v)
const isAnchor = (v: unknown) => v === null || (typeof v === "string" && ID_RE.test(v))

function validOp(op: unknown): op is Op {
    if (!isObj(op)) return false
    switch (op.kind) {
        case "insert":
            return typeof op.rowId === "string" && ID_RE.test(op.rowId) &&
                isAnchor(op.afterRowId) && isAnchor(op.beforeRowId) && isObj(op.row)
        case "remove":
            return typeof op.rowId === "string" && ID_RE.test(op.rowId)
        case "move":
            return typeof op.rowId === "string" && ID_RE.test(op.rowId) &&
                isAnchor(op.afterRowId) && isAnchor(op.beforeRowId)
        case "editRow":
            return typeof op.rowId === "string" && ID_RE.test(op.rowId) && isObj(op.set) &&
                (op.base === undefined || isObj(op.base))
        case "editSetlist":
            return isObj(op.set) && (op.base === undefined || isObj(op.base))
        default:
            return false
    }
}

/** Shape check for a request. Returns a refusal, or null when it is well formed. */
export function validateOpsRequest(req: unknown): OpsRefusal | null {
    if (!isObj(req)) return refuse("invalid", "body must be an object")
    if (typeof req.clientBatchId !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(req.clientBatchId))
        return refuse("invalid", "clientBatchId must be 1-128 of [A-Za-z0-9_.:-]")
    if (typeof req.baseVersion !== "number" || !Number.isFinite(req.baseVersion))
        return refuse("invalid", "baseVersion must be a number")
    if (!Array.isArray(req.ops)) return refuse("invalid", "ops must be an array")
    if (req.ops.length > MAX_OPS) return refuse("too-large", `at most ${MAX_OPS} ops per batch`)
    for (let i = 0; i < req.ops.length; i++) {
        if (!validOp(req.ops[i])) return refuse("invalid", `op ${i} is malformed`)
    }
    return null
}

// ── authorization ──────────────────────────────────────────────────────────

/**
 * The caller must be an admin or band leader IN THE SETLIST'S TENANT. The
 * tenant comes from the setlist doc, never from the request. A caller with no
 * standing in that tenant gets `not-found` (another tenant's id reads as
 * absent, as everywhere else); a member below band leader gets `forbidden`.
 */
export async function authorizeSetlistCaller(
    db: DB,
    uid: string,
    setlistId: string,
): Promise<{ ok: true; org: OrgId; role: string } | OpsRefusal> {
    if (!uid) return refuse("forbidden")
    if (!ID_RE.test(setlistId)) return refuse("invalid", "bad setlist id")
    const snap = await setlistRef(db, setlistId).get()
    if (!snap.exists) return refuse("not-found")
    const org = rowOrg(snap.data()?.orgId)
    const role = await readMembershipRole(db, uid, org)
    if (!role || role === "denied") return refuse("not-found")
    if (role !== "admin" && role !== "band_leader") return refuse("forbidden")
    return { ok: true, org, role }
}

// ── wire shape ─────────────────────────────────────────────────────────────

function toWire(v: unknown): unknown {
    if (v instanceof Timestamp) return v.toDate().toISOString()
    if (Array.isArray(v)) return v.map(toWire)
    if (isObj(v) && Object.getPrototypeOf(v) === Object.prototype) {
        const out: Record<string, unknown> = {}
        for (const [k, inner] of Object.entries(v)) out[k] = toWire(inner)
        return out
    }
    return v
}

async function readRows(db: DB, ids: readonly string[]): Promise<OpsOk["rows"]> {
    if (ids.length === 0) return []
    const snaps = await db.getAll(...ids.map((id) => trackRef(db, id)))
    return snaps
        .filter((s) => s.exists)
        .map((s) => ({ ...(toWire(s.data()) as Record<string, unknown>), id: s.id }))
}

// ── engine ─────────────────────────────────────────────────────────────────

interface RowState {
    original: Record<string, unknown> | null // null = inserted by this batch
    cur: Record<string, unknown>
    patch: Record<string, unknown>
}

interface StoredBatch {
    uid: string | null
    version: number
    applied: number[]
    conflicts: OpConflict[]
    touched: string[]
    removed: string[]
    createdAt: unknown
    expiresAt: Timestamp
}

type Planned =
    | { kind: "done"; stored: Omit<StoredBatch, "createdAt" | "expiresAt">; replayed: boolean }
    | { kind: "refused"; refusal: OpsRefusal }

/** Firestore field patch: `null` means clear. */
function toFieldPatch(apply: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(apply)) out[k] = v === null ? FieldValue.delete() : v
    return out
}

function applyToCur(cur: Record<string, unknown>, apply: Record<string, unknown>) {
    for (const [k, v] of Object.entries(apply)) {
        if (v === null) delete cur[k]
        else cur[k] = v
    }
}

export interface ApplyOpsOptions {
    /** uid stamped as lastModifiedBy and on the receipt. */
    actor?: string
    /**
     * Keep an idempotency receipt at `setlists/{id}/opBatches/{clientBatchId}`.
     * Default true. In-process server callers that mint a throwaway id may
     * turn it off.
     */
    receipt?: boolean
}

/**
 * Apply a batch of ops to one setlist in ONE transaction. The caller has
 * already authorized (see `applyOps` for the authorizing entry point).
 */
export async function applyOpsAuthorized(
    db: DB,
    setlistId: string,
    req: OpsRequest,
    opts: ApplyOpsOptions = {},
): Promise<OpsResult> {
    const invalid = validateOpsRequest(req)
    if (invalid) return invalid
    const useReceipt = opts.receipt !== false
    const sRef = setlistRef(db, setlistId)
    const receiptRef = sRef.collection(OP_BATCHES).doc(req.clientBatchId)

    const planned = await runSetlistTransaction<Planned>(
        db,
        async (tx, w) => {
            const [receiptSnap, setlistSnap, tracksSnap] = await Promise.all([
                useReceipt ? tx.get(receiptRef) : Promise.resolve(null),
                tx.get(sRef),
                tx.get(db.collection(TRACKS).where("setlistId", "==", setlistId)),
            ])
            if (receiptSnap?.exists) {
                const s = receiptSnap.data() as StoredBatch
                return { kind: "done", replayed: true, stored: s }
            }
            if (!setlistSnap.exists) return { kind: "refused", refusal: refuse("not-found") }
            const setlist = setlistSnap.data() as Record<string, unknown>
            const org = rowOrg(setlist.orgId)

            const rows = new Map<string, RowState>()
            const sorted = canonicalSort(
                tracksSnap.docs.map((d) => {
                    const data = d.data() as Record<string, unknown>
                    return { id: d.id, order: typeof data.order === "number" ? data.order : 0, data }
                }),
            )
            for (const r of sorted) rows.set(r.id, { original: r.data, cur: { ...r.data }, patch: {} })
            const seq: string[] = sorted.map((r) => r.id)
            const removed = new Set<string>()
            const setlistCur: Record<string, unknown> = { ...setlist }
            let setlistPatch: Record<string, unknown> = {}

            const applied: number[] = []
            const conflicts: OpConflict[] = []

            req.ops.forEach((op, opIndex) => {
                switch (op.kind) {
                    case "insert": {
                        const existing = rows.get(op.rowId)
                        if (existing || removed.has(op.rowId)) {
                            if (existing?.original && existing.original.opBatchId === req.clientBatchId) {
                                applied.push(opIndex) // the same batch already inserted it
                            } else {
                                conflicts.push({ opIndex, reason: "row-exists" })
                            }
                            return
                        }
                        const at = placementIndex(seq, op.afterRowId, op.beforeRowId)
                        seq.splice(at, 0, op.rowId)
                        rows.set(op.rowId, {
                            original: null,
                            cur: {
                                ...cleanRowPayload(op.row, RESERVED_ROW_FIELDS),
                                id: op.rowId,
                                setlistId,
                                orgId: org,
                                opBatchId: req.clientBatchId,
                            },
                            patch: {},
                        })
                        applied.push(opIndex)
                        return
                    }
                    case "remove": {
                        const i = seq.indexOf(op.rowId)
                        if (i >= 0) {
                            seq.splice(i, 1)
                            const st = rows.get(op.rowId)
                            rows.delete(op.rowId)
                            if (st?.original) removed.add(op.rowId)
                        }
                        applied.push(opIndex) // removing a missing row is a no-op success
                        return
                    }
                    case "move": {
                        const i = seq.indexOf(op.rowId)
                        if (i < 0) {
                            conflicts.push({ opIndex, reason: "row-gone" })
                            return
                        }
                        seq.splice(i, 1)
                        // An anchor equal to the row itself is gone from `seq` now, so it falls through.
                        seq.splice(placementIndex(seq, op.afterRowId, op.beforeRowId), 0, op.rowId)
                        applied.push(opIndex)
                        return
                    }
                    case "editRow": {
                        const st = rows.get(op.rowId)
                        if (!st) {
                            conflicts.push({ opIndex, reason: "row-gone" })
                            return
                        }
                        const m = mergeFields(st.cur, op.set, op.base ?? {}, RESERVED_ROW_FIELDS)
                        applyToCur(st.cur, m.apply)
                        Object.assign(st.patch, m.apply)
                        for (const c of m.conflicts) conflicts.push({ opIndex, reason: "field", ...c })
                        if (m.conflicts.length === 0 || Object.keys(m.apply).length > 0) applied.push(opIndex)
                        return
                    }
                    case "editSetlist": {
                        const m = mergeFields(setlistCur, op.set, op.base ?? {}, RESERVED_SETLIST_FIELDS)
                        applyToCur(setlistCur, m.apply)
                        setlistPatch = { ...setlistPatch, ...m.apply }
                        for (const c of m.conflicts) conflicts.push({ opIndex, reason: "field", ...c })
                        if (m.conflicts.length === 0 || Object.keys(m.apply).length > 0) applied.push(opIndex)
                        return
                    }
                }
            })

            // Renumber 0..n-1 in the resulting sequence. A row whose order moves is touched.
            seq.forEach((id, order) => {
                const st = rows.get(id)!
                st.cur.order = order
                if (st.original && st.original.order !== order) st.patch.order = order
            })

            const inserts = seq.filter((id) => rows.get(id)!.original === null)
            const updates = seq.filter((id) => {
                const st = rows.get(id)!
                return st.original !== null && Object.keys(st.patch).length > 0
            })
            const rowWrites = inserts.length + updates.length + removed.size
            const anyWrite = rowWrites > 0 || Object.keys(setlistPatch).length > 0
            if (rowWrites + 2 > MAX_WRITES) {
                return { kind: "refused", refusal: refuse("too-large", "batch would touch too many rows") }
            }

            const nextVersion = anyWrite ? readVersion(setlist) + 1 : readVersion(setlist)
            if (anyWrite) {
                for (const id of removed) w.deleteTrack(id)
                for (const id of inserts) {
                    const cur = rows.get(id)!.cur
                    w.setTrack(id, { ...cur, version: 1, createdAt: FieldValue.serverTimestamp() })
                }
                for (const id of updates) w.updateTrack(id, toFieldPatch(rows.get(id)!.patch))
                const finalRows = seq.map((id) => rows.get(id)!.cur)
                w.updateSetlist(setlistId, {
                    ...toFieldPatch(setlistPatch),
                    ...deriveSetlistCounts(finalRows),
                })
            }

            const stored = {
                uid: opts.actor ?? null,
                version: nextVersion,
                applied,
                conflicts: stripUndefined(conflicts),
                touched: [...inserts, ...updates],
                removed: [...removed],
            }
            if (useReceipt) {
                // The receipt lives under the setlist; clients are denied it by rule.
                tx.set(receiptRef, {
                    ...stored,
                    createdAt: FieldValue.serverTimestamp(),
                    expiresAt: Timestamp.fromMillis(Date.now() + OP_BATCH_TTL_MS),
                })
            }
            return { kind: "done", replayed: false, stored }
        },
        { actor: opts.actor },
    )

    if (planned.kind === "refused") return planned.refusal
    const s = planned.stored
    return {
        ok: true,
        version: s.version,
        applied: s.applied,
        conflicts: (toWire(s.conflicts) as OpConflict[]) ?? [],
        rows: await readRows(db, s.touched),
        removed: s.removed,
        ...(planned.replayed ? { replayed: true } : {}),
    }
}

/**
 * The authorizing entry point (route and any caller acting for a user):
 * validate, check the caller in the setlist's tenant, then apply.
 */
export async function applyOps(
    db: DB,
    uid: string,
    setlistId: string,
    req: OpsRequest,
): Promise<OpsResult> {
    const invalid = validateOpsRequest(req)
    if (invalid) return invalid
    const auth = await authorizeSetlistCaller(db, uid, setlistId)
    if (!auth.ok) return auth
    return applyOpsAuthorized(db, setlistId, req, { actor: uid })
}
