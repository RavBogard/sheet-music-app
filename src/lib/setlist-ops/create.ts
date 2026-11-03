import crypto from "crypto"
import { FieldValue } from "firebase-admin/firestore"
import { deriveSetlistCounts } from "@/lib/setlist-derived-counts"
import { rowOrg } from "@/lib/mcp/org-context"
import { readMembershipRole } from "@/lib/org/access"
import type { OrgId } from "@/lib/org/types"
import { parseEventDate } from "@/lib/parse-event-date"
import { computeWeek, isFamilyOrg, weekFields } from "@/lib/family/week-key"
import { storedClassFor, storedRabbiSlot } from "@/lib/history/classify"
import { isTestSetlist } from "@/types/models"
import { canonicalSort, stripUndefined } from "./pure"
import { checkRowFields, checkSetlistFields, isSafeKey, ROW_FIELD_NAMES } from "./fields"
import { RESERVED_ROW_FIELDS } from "./types"
import { runSetlistTransaction, setlistRef, TRACKS } from "./writer"
import { writeNewSetlist } from "./maintenance"
import type { OpsRefusal, RowFields } from "./types"

/**
 * Create a setlist and its rows in ONE transaction: the browser's create,
 * duplicate, clone and save-as-template paths (PR 3 of the setlist sync
 * redesign). Before this the browser wrote the setlist doc with `addDoc` and
 * then one outbox `set` per row, so a failed row left a setlist with holes.
 *
 * Tenant: a setlist copied from another (`copyFrom`) lives in the SOURCE's
 * tenant, read from the source doc. A fresh setlist lives in the request's
 * host tenant (the proxy-set `x-org-id`, never a body field). Either way the
 * caller must be an admin or band leader there, the same bar as /ops. A
 * source in a tenant where the caller has no standing reads as not-found.
 *
 * Idempotency: the client picks the setlist id. A repeat from the same caller
 * with the same request returns the first result; anything else on an
 * existing id is refused.
 */

type DB = FirebaseFirestore.Firestore

const ID_RE = /^(?!\.\.?$)[A-Za-z0-9_.:-]{1,128}$/
const MAX_ROWS = 300

export interface CreateSetlistRequest {
    /** Client-chosen id for the new setlist (idempotency key). */
    setlistId: string
    name: string
    /** ISO date. */
    eventDate?: string
    templateType?: string | null
    rabbi?: string | null
    isTemplate?: boolean
    /** The source's stored rabbi slot (clone); a known slot key or ignored. */
    rabbiSlot?: string
    /** Assigned musicians, as the wizard and clone carry them. */
    musicians?: Array<Record<string, unknown>>
    /** Copy this setlist's rows (server-side, in its order). */
    copyFrom?: string
    /** How the copy is recorded on the new doc. */
    copyKind?: "copiedFrom" | "clonedFrom"
    /** Rows for a fresh setlist (ignored when `copyFrom` is given). */
    rows?: RowFields[]
}

export interface CreateSetlistOk {
    ok: true
    setlistId: string
    orgId: OrgId
    trackCount: number
    replayed?: boolean
}

const refuse = (reason: OpsRefusal["reason"], message?: string): OpsRefusal => ({
    ok: false,
    reason,
    ...(message ? { message } : {}),
})

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

const KNOWN_ROW_FIELDS = new Set(ROW_FIELD_NAMES)

/**
 * A server-side copy carries EVERY stored field of the source row except its
 * identity, tenant, parent and server stamps (RESERVED_ROW_FIELDS). Fields the
 * client may write are re-validated (one that fails is left off; a copy is
 * best effort); any other stored field is the source's own data and is copied
 * as it is, so a clone never loses what the author had on the row.
 */
export function copyableRow(data: Record<string, unknown>): RowFields {
    const out: RowFields = {}
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined || v === null || RESERVED_ROW_FIELDS.has(k) || !isSafeKey(k)) continue
        if (!KNOWN_ROW_FIELDS.has(k)) {
            out[k] = v
            continue
        }
        const r = checkRowFields({ [k]: v }, "row")
        if (r.ok && r.value[k] !== undefined) out[k] = r.value[k]
    }
    return out
}

function cleanMusicians(v: unknown): Array<Record<string, unknown>> | OpsRefusal {
    if (v === undefined) return []
    if (!Array.isArray(v) || v.length > 60) return refuse("invalid", "musicians must be a list of at most 60")
    const out: Array<Record<string, unknown>> = []
    for (const m of v) {
        if (!isObj(m)) return refuse("invalid", "each musician is an object")
        const clean: Record<string, unknown> = {}
        // The roster status and role are the scheduling flow's, never a client's; a uid
        // is kept only when that person is a member of the tenant (checked below).
        for (const k of ["uid", "name", "email", "instrument"]) {
            const val = m[k]
            // Only short strings are kept; anything else is left off the copy.
            if (typeof val !== "string" || val.length > 300) continue
            clean[k] = val
        }
        out.push(clean)
    }
    return out
}

export function validateCreateRequest(body: unknown): { ok: true; req: CreateSetlistRequest } | OpsRefusal {
    if (!isObj(body)) return refuse("invalid", "body must be an object")
    if (typeof body.setlistId !== "string" || !ID_RE.test(body.setlistId)) return refuse("invalid", "bad setlist id")
    const meta = checkSetlistFields(
        stripUndefined({
            name: body.name,
            eventDate: body.eventDate,
            templateType: body.templateType,
            rabbi: body.rabbi,
        }) as Record<string, unknown>,
        "set",
    )
    if (!meta.ok) return refuse("invalid", meta.message)
    if (typeof meta.value.name !== "string" || !meta.value.name) return refuse("invalid", "name is required")
    if (body.isTemplate !== undefined && typeof body.isTemplate !== "boolean") return refuse("invalid", "isTemplate is a boolean")
    if (body.copyFrom !== undefined && (typeof body.copyFrom !== "string" || !ID_RE.test(body.copyFrom)))
        return refuse("invalid", "bad copyFrom id")
    if (body.copyKind !== undefined && body.copyKind !== "copiedFrom" && body.copyKind !== "clonedFrom")
        return refuse("invalid", "copyKind is copiedFrom or clonedFrom")
    const musicians = cleanMusicians(body.musicians)
    if (!Array.isArray(musicians)) return musicians
    const rows: RowFields[] = []
    if (body.copyFrom === undefined && body.rows !== undefined) {
        if (!Array.isArray(body.rows)) return refuse("invalid", "rows must be a list")
        if (body.rows.length > MAX_ROWS) return refuse("too-large", `at most ${MAX_ROWS} rows`)
        for (let i = 0; i < body.rows.length; i++) {
            const row = body.rows[i]
            if (!isObj(row)) return refuse("invalid", `row ${i} is not an object`)
            const r = checkRowFields(row, "row")
            if (!r.ok) return refuse("invalid", `row ${i}: ${r.message}`)
            rows.push(r.value)
        }
    }
    return {
        ok: true,
        req: {
            setlistId: body.setlistId,
            name: meta.value.name as string,
            ...(typeof meta.value.eventDate === "string" ? { eventDate: meta.value.eventDate } : {}),
            ...(meta.value.templateType !== undefined ? { templateType: meta.value.templateType as string | null } : {}),
            ...(meta.value.rabbi !== undefined ? { rabbi: meta.value.rabbi as string | null } : {}),
            ...(body.isTemplate !== undefined ? { isTemplate: body.isTemplate as boolean } : {}),
            ...(storedRabbiSlot(body.rabbiSlot) ? { rabbiSlot: storedRabbiSlot(body.rabbiSlot) as string } : {}),
            musicians,
            ...(typeof body.copyFrom === "string" ? { copyFrom: body.copyFrom } : {}),
            ...(body.copyKind ? { copyKind: body.copyKind as "copiedFrom" | "clonedFrom" } : {}),
            rows,
        },
    }
}

function requestHash(uid: string, req: CreateSetlistRequest): string {
    return crypto.createHash("sha256").update(JSON.stringify([uid, req])).digest("hex").slice(0, 40)
}

async function ownerNameFor(db: DB, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "Anonymous"
    } catch {
        return "Anonymous"
    }
}

/**
 * Create a setlist for `uid`. `hostOrg` is the request's host tenant, used
 * only when nothing is copied.
 */
export async function createSetlistForCaller(
    db: DB,
    uid: string,
    hostOrg: OrgId,
    body: unknown,
): Promise<CreateSetlistOk | OpsRefusal> {
    if (!uid) return refuse("forbidden")
    const v = validateCreateRequest(body)
    if (!v.ok) return v
    const req = v.req

    // The tenant: the source's when copying, else the host's.
    let org: OrgId = rowOrg(hostOrg)
    let sourceRows: RowFields[] | null = null
    if (req.copyFrom) {
        const src = await setlistRef(db, req.copyFrom).get()
        if (!src.exists) return refuse("not-found")
        org = rowOrg(src.data()?.orgId)
    }
    const role = await readMembershipRole(db, uid, org)
    if (!role || role === "denied") return refuse(req.copyFrom ? "not-found" : "forbidden")
    if (role !== "admin" && role !== "band_leader") return refuse("forbidden")

    if (req.copyFrom) {
        const snap = await db.collection(TRACKS).where("setlistId", "==", req.copyFrom).get()
        const sorted = canonicalSort(
            snap.docs
                .filter((d) => rowOrg((d.data() as Record<string, unknown>).orgId) === org)
                .map((d) => {
                    const data = d.data() as Record<string, unknown>
                    return { id: d.id, order: typeof data.order === "number" ? data.order : 0, data }
                }),
        )
        sourceRows = sorted.map((r) => copyableRow(r.data))
    }
    const rows = sourceRows ?? req.rows ?? []
    if (rows.length > MAX_ROWS) return refuse("too-large", `at most ${MAX_ROWS} rows`)

    const hash = requestHash(uid, req)
    const ownerName = await ownerNameFor(db, uid)
    const eventDate = req.eventDate ? parseEventDate(req.eventDate, org) : undefined
    const week = eventDate && isFamilyOrg(org) ? await computeWeek(eventDate, org) : null
    const finalRows = rows.map((r, i) => ({
        ...r,
        type: typeof r.type === "string" ? r.type : "song",
        ...(typeof r.fileId === "string" && r.songId === undefined ? { songId: r.fileId } : {}),
        order: i,
    }))
    // A musician uid stays only when that person has standing in the tenant.
    const musicians: Array<Record<string, unknown>> = []
    for (const m of req.musicians ?? []) {
        if (typeof m.uid === "string" && m.uid) {
            const r = await readMembershipRole(db, m.uid, org)
            if (!r || r === "denied") {
                const { uid: _drop, ...rest } = m
                void _drop
                musicians.push(rest)
                continue
            }
        }
        musicians.push(m)
    }

    const outcome = await runSetlistTransaction<CreateSetlistOk | OpsRefusal>(
        db,
        async (tx, w) => {
            const sRef = setlistRef(db, req.setlistId)
            const existing = await tx.get(sRef)
            if (existing.exists) {
                const d = existing.data() as Record<string, unknown>
                if (d.ownerId === uid && d.createRequest === hash) {
                    return { ok: true, setlistId: req.setlistId, orgId: rowOrg(d.orgId), trackCount: Number(d.trackCount ?? 0), replayed: true }
                }
                return refuse("invalid", "a setlist with this id already exists")
            }
            const nowIso = new Date().toISOString()
            const payload: Record<string, unknown> = {
                id: req.setlistId,
                orgId: org,
                name: req.name,
                date: eventDate ?? FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                createdAt: FieldValue.serverTimestamp(),
                ...deriveSetlistCounts(finalRows),
                hydrated: true,
                ownerId: uid,
                ownerName,
                version: 1,
                lastModifiedAt: nowIso,
                lastModifiedBy: uid,
                createRequest: hash,
                isTest: isTestSetlist({ name: req.name, ownerId: uid }),
                ...(eventDate ? { eventDate } : {}),
                ...(req.templateType ? { templateType: req.templateType } : {}),
                ...(req.rabbi ? { rabbi: req.rabbi } : {}),
                ...stripUndefined(storedClassFor({ templateType: req.templateType ?? null, rabbi: req.rabbi ?? null }) as Record<string, unknown>),
                ...(req.rabbiSlot ? { rabbiSlot: req.rabbiSlot } : {}),
                ...(req.isTemplate ? { isTemplate: true } : {}),
                ...(musicians.length > 0
                    ? { musicians, assignedUids: musicians.map((m) => m.uid).filter((u): u is string => typeof u === "string" && !!u) }
                    : {}),
                ...(req.copyFrom ? { [req.copyKind ?? "copiedFrom"]: req.copyFrom } : {}),
                ...(week ? weekFields(week) : {}),
            }
            // The one create-setlist writer (maintenance.ts), so the tenant of
            // every doc is checked the same way as on the MCP paths.
            writeNewSetlist(w, org, {
                setlistId: req.setlistId,
                setlist: payload,
                rows: finalRows.map((row) => {
                    const id = crypto.randomUUID()
                    return {
                        id,
                        data: {
                            ...row,
                            id,
                            orgId: org,
                            version: 1,
                            createdAt: FieldValue.serverTimestamp(),
                            lastModifiedAt: nowIso,
                        },
                    }
                }),
            })
            return { ok: true, setlistId: req.setlistId, orgId: org, trackCount: finalRows.length }
        },
        { actor: uid },
    )
    return outcome
}
