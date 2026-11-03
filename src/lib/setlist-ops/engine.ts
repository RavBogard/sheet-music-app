import crypto from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { deriveSetlistCounts } from "@/lib/setlist-derived-counts"
import { rowOrg } from "@/lib/mcp/org-context"
import { readVersion } from "@/lib/mcp/error-envelopes"
import { readMembershipRole } from "@/lib/org/access"
import type { OrgId } from "@/lib/org/types"
import { parseEventDate } from "@/lib/parse-event-date"
import { computeWeek, isFamilyOrg, weekFields } from "@/lib/family/week-key"
import { storedClassFor } from "@/lib/history/classify"
import { canonicalSort, mergeFields, placementIndex, stripUndefined } from "./pure"
import { checkRowFields, checkSetlistFields } from "./fields"
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

/** A Firestore doc id: 1-200 chars, no `/`, and not `.` or `..`. */
const ID_RE = /^(?!\.\.?$)[^/]{1,200}$/
const BATCH_ID_RE = /^(?!\.\.?$)[A-Za-z0-9_.:-]{1,128}$/

const refuse = (reason: OpsRefusal["reason"], message?: string): OpsRefusal => ({
    ok: false,
    reason,
    ...(message ? { message } : {}),
})

// ── validation ─────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v)
const NO_RESERVED: ReadonlySet<string> = new Set()
const isId = (v: unknown): v is string => typeof v === "string" && ID_RE.test(v)
const isAnchor = (v: unknown) => v === null || isId(v)

/**
 * Validate the shape AND every field of a request, returning a cleaned copy
 * (freeform strings sanitized, undefined dropped). Field names must be plain
 * (no dots, no `__`); server-owned fields in `row`/`set` are refused, not
 * dropped; unknown fields are refused. Types and sizes are the MCP tools'.
 */
export function normalizeOpsRequest(req: unknown): { ok: true; req: OpsRequest } | OpsRefusal {
    if (!isObj(req)) return refuse("invalid", "body must be an object")
    if (typeof req.clientBatchId !== "string" || !BATCH_ID_RE.test(req.clientBatchId))
        return refuse("invalid", "clientBatchId must be 1-128 of [A-Za-z0-9_.:-]")
    if (typeof req.baseVersion !== "number" || !Number.isFinite(req.baseVersion))
        return refuse("invalid", "baseVersion must be a number")
    if (!Array.isArray(req.ops)) return refuse("invalid", "ops must be an array")
    if (req.ops.length > MAX_OPS) return refuse("too-large", `at most ${MAX_OPS} ops per batch`)
    const ops: Op[] = []
    for (let i = 0; i < req.ops.length; i++) {
        const op = req.ops[i] as unknown
        const bad = (why: string) => refuse("invalid", `op ${i}: ${why}`)
        if (!isObj(op)) return bad("not an object")
        switch (op.kind) {
            case "insert": {
                if (!isId(op.rowId) || !isAnchor(op.afterRowId) || !isAnchor(op.beforeRowId) || !isObj(op.row))
                    return bad("malformed insert")
                const row = checkRowFields(op.row, "row")
                if (!row.ok) return bad(row.message)
                ops.push({ kind: "insert", rowId: op.rowId, afterRowId: op.afterRowId as string | null, beforeRowId: op.beforeRowId as string | null, row: row.value })
                break
            }
            case "remove":
                if (!isId(op.rowId)) return bad("malformed remove")
                ops.push({ kind: "remove", rowId: op.rowId })
                break
            case "move":
                if (!isId(op.rowId) || !isAnchor(op.afterRowId) || !isAnchor(op.beforeRowId)) return bad("malformed move")
                ops.push({ kind: "move", rowId: op.rowId, afterRowId: op.afterRowId as string | null, beforeRowId: op.beforeRowId as string | null })
                break
            case "editRow": {
                if (!isId(op.rowId) || !isObj(op.set) || (op.base !== undefined && !isObj(op.base))) return bad("malformed editRow")
                const set = checkRowFields(op.set, "set")
                if (!set.ok) return bad(set.message)
                const base = checkRowFields(isObj(op.base) ? op.base : {}, "base")
                if (!base.ok) return bad(base.message)
                ops.push({ kind: "editRow", rowId: op.rowId, set: set.value, base: base.value })
                break
            }
            case "editSetlist": {
                if (!isObj(op.set) || (op.base !== undefined && !isObj(op.base))) return bad("malformed editSetlist")
                const set = checkSetlistFields(op.set, "set")
                if (!set.ok) return bad(set.message)
                const base = checkSetlistFields(isObj(op.base) ? op.base : {}, "base")
                if (!base.ok) return bad(base.message)
                ops.push({ kind: "editSetlist", set: set.value, base: base.value })
                break
            }
            default:
                return bad("unknown kind")
        }
    }
    return { ok: true, req: { clientBatchId: req.clientBatchId, baseVersion: req.baseVersion, ops } }
}

/** Shape and field check for a request. Returns a refusal, or null when it is well formed. */
export function validateOpsRequest(req: unknown): OpsRefusal | null {
    const r = normalizeOpsRequest(req)
    return r.ok ? null : r
}

/** Stable hash of a batch's ops, so a reused clientBatchId with other ops is caught. */
export function opsHash(ops: readonly Op[]): string {
    const stable = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(stable)
        if (isObj(v)) {
            const out: Record<string, unknown> = {}
            for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = stable(v[k])
            return out
        }
        return v
    }
    return crypto.createHash("sha256").update(JSON.stringify(stable(ops))).digest("hex")
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
    if (!isId(setlistId)) return refuse("invalid", "bad setlist id")
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
    opsHash: string
    version: number
    applied: number[]
    conflicts: OpConflict[]
    touched: string[]
    removed: string[]
}

type Planned =
    | { kind: "done"; stored: StoredBatch; replayed: boolean }
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
 * Turn the client's editSetlist values into stored ones before the
 * transaction: `eventDate` ISO → Timestamp in the tenant's clock, and the
 * week key a moved date implies (family tenant only).
 */
async function prepareSetlistEdits(
    ops: Op[],
    org: OrgId,
): Promise<Map<number, Record<string, unknown>>> {
    const derived = new Map<number, Record<string, unknown>>()
    for (let i = 0; i < ops.length; i++) {
        const op = ops[i]
        if (op.kind !== "editSetlist") continue
        for (const side of [op.set, op.base] as Array<Record<string, unknown>>) {
            if (typeof side.eventDate === "string") side.eventDate = parseEventDate(side.eventDate, org)
        }
        if (op.set.eventDate instanceof Timestamp && isFamilyOrg(org)) {
            const week = await computeWeek(op.set.eventDate, org)
            derived.set(
                i,
                week ? weekFields(week) : { weekKey: FieldValue.delete(), weekKeyDay: FieldValue.delete(), parashaName: FieldValue.delete() },
            )
        }
    }
    return derived
}

/**
 * Apply a batch of ops to one setlist in ONE transaction. The caller has
 * already authorized (see `applyOps` for the authorizing entry point).
 */
export async function applyOpsAuthorized(
    db: DB,
    setlistId: string,
    rawReq: OpsRequest,
    opts: ApplyOpsOptions = {},
): Promise<OpsResult> {
    if (!isId(setlistId)) return refuse("invalid", "bad setlist id")
    const norm = normalizeOpsRequest(rawReq)
    if (!norm.ok) return norm
    const req = norm.req
    const hash = opsHash(req.ops)
    const useReceipt = opts.receipt !== false
    const sRef = setlistRef(db, setlistId)
    const receiptRef = sRef.collection(OP_BATCHES).doc(req.clientBatchId)

    const pre = await sRef.get()
    if (!pre.exists) return refuse("not-found")
    const org = rowOrg(pre.data()?.orgId) // a setlist's tenant never changes
    const weekFor = await prepareSetlistEdits(req.ops, org)

    const insertIds = [...new Set(req.ops.flatMap((op) => (op.kind === "insert" ? [op.rowId] : [])))]

    const planned = await runSetlistTransaction<Planned>(
        db,
        async (tx, w) => {
            // Every read before any write.
            const [receiptSnap, setlistSnap, tracksSnap, insertSnaps] = await Promise.all([
                useReceipt ? tx.get(receiptRef) : Promise.resolve(null),
                tx.get(sRef),
                tx.get(db.collection(TRACKS).where("setlistId", "==", setlistId)),
                insertIds.length ? tx.getAll(...insertIds.map((id) => trackRef(db, id))) : Promise.resolve([]),
            ])
            if (receiptSnap?.exists) {
                const s = receiptSnap.data() as StoredBatch
                if (s.opsHash !== hash) {
                    return { kind: "refused", refusal: refuse("invalid", "clientBatchId was already used for different ops") }
                }
                return { kind: "done", replayed: true, stored: s }
            }
            if (!setlistSnap.exists) return { kind: "refused", refusal: refuse("not-found") }
            const setlist = setlistSnap.data() as Record<string, unknown>

            // Any doc an insert names, wherever it lives (another setlist, another tenant).
            const existingAnywhere = new Map<string, Record<string, unknown>>()
            for (const s of insertSnaps) if (s.exists) existingAnywhere.set(s.id, s.data() as Record<string, unknown>)

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
            const setlistDerived: Record<string, unknown> = {}
            let structural = false

            const applied: number[] = []
            const conflicts: OpConflict[] = []

            req.ops.forEach((op, opIndex) => {
                switch (op.kind) {
                    case "insert": {
                        const elsewhere = existingAnywhere.get(op.rowId)
                        if (elsewhere || rows.has(op.rowId) || removed.has(op.rowId)) {
                            const own =
                                !!elsewhere &&
                                elsewhere.setlistId === setlistId &&
                                elsewhere.opBatchId === req.clientBatchId &&
                                rows.has(op.rowId)
                            if (own) applied.push(opIndex) // this same batch already inserted it
                            else conflicts.push({ opIndex, reason: "row-exists" })
                            return
                        }
                        const at = placementIndex(seq, op.afterRowId, op.beforeRowId)
                        seq.splice(at, 0, op.rowId)
                        rows.set(op.rowId, {
                            original: null,
                            cur: { ...op.row, id: op.rowId, setlistId, orgId: org, opBatchId: req.clientBatchId },
                            patch: {},
                        })
                        structural = true
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
                            structural = true
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
                        // A row anchored on itself stays where it is.
                        if (op.afterRowId === op.rowId || op.beforeRowId === op.rowId) {
                            applied.push(opIndex)
                            return
                        }
                        seq.splice(i, 1)
                        seq.splice(placementIndex(seq, op.afterRowId, op.beforeRowId), 0, op.rowId)
                        structural = true
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
                        // `gig` merges per sub-field (venue, start, setTargets…):
                        // the editor sends only the parts it changed with their
                        // base, so it never clobbers a part MCP changed. A null
                        // part removes it; `gig: null` clears the whole gig.
                        let set = op.set
                        const gigConflicts: OpConflict[] = []
                        let gigApplied = false
                        if (isObj(op.set.gig)) {
                            const { gig: setGig, ...rest } = op.set
                            set = rest
                            const curGig: Record<string, unknown> = isObj(setlistCur.gig) ? { ...setlistCur.gig } : {}
                            const baseGig = isObj(op.base?.gig) ? (op.base.gig as Record<string, unknown>) : {}
                            const gm = mergeFields(curGig, setGig as Record<string, unknown>, baseGig, NO_RESERVED)
                            applyToCur(curGig, gm.apply)
                            if (Object.keys(gm.apply).length > 0) {
                                const next = Object.keys(curGig).length > 0 ? curGig : null
                                if (next) setlistCur.gig = next
                                else delete setlistCur.gig
                                setlistPatch = { ...setlistPatch, gig: next }
                                gigApplied = true
                            }
                            for (const c of gm.conflicts) gigConflicts.push({ opIndex, reason: "field", ...c, field: `gig.${c.field}` })
                        }
                        const m = mergeFields(setlistCur, set, op.base ?? {}, RESERVED_SETLIST_FIELDS)
                        conflicts.push(...gigConflicts)
                        applyToCur(setlistCur, m.apply)
                        setlistPatch = { ...setlistPatch, ...m.apply }
                        // Derived class fields follow the author's own entries, as on update_setlist.
                        if ("templateType" in m.apply)
                            setlistDerived.serviceType = storedClassFor({ templateType: m.apply.templateType as string | null }).serviceType ?? null
                        if ("rabbi" in m.apply)
                            setlistDerived.rabbiSlot = storedClassFor({ rabbi: m.apply.rabbi as string | null }).rabbiSlot ?? null
                        if ("eventDate" in m.apply && weekFor.has(opIndex)) Object.assign(setlistDerived, weekFor.get(opIndex))
                        for (const c of m.conflicts) conflicts.push({ opIndex, reason: "field", ...c })
                        if ((m.conflicts.length === 0 && gigConflicts.length === 0) || Object.keys(m.apply).length > 0 || gigApplied) applied.push(opIndex)
                        return
                    }
                }
            })

            // Renumber 0..n-1 ONLY after a structural change (R11-b: an edit
            // never rewrites order). A row whose order moves is touched.
            if (structural) {
                seq.forEach((id, order) => {
                    const st = rows.get(id)!
                    st.cur.order = order
                    if (st.original && st.original.order !== order) st.patch.order = order
                })
            }

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
                    // `create`, never `set`: an existing doc can never be replaced.
                    w.createTrack(id, { ...cur, version: 1, createdAt: FieldValue.serverTimestamp() })
                }
                for (const id of updates) w.updateTrack(id, toFieldPatch(rows.get(id)!.patch))
                const finalRows = seq.map((id) => rows.get(id)!.cur)
                w.updateSetlist(setlistId, {
                    ...toFieldPatch(setlistPatch),
                    ...setlistDerived,
                    ...deriveSetlistCounts(finalRows),
                })
            }

            const stored: StoredBatch = {
                uid: opts.actor ?? null,
                opsHash: hash,
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
