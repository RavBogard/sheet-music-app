import crypto from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import {
    assertEditor,
    readUserRole,
} from "@/lib/mcp/server-tracks-write"
import { checkUserRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import { isSongType } from "@/lib/setlist-track-count"

/**
 * Cycle-6 Lane 2 — setlist-template CRUD pack.
 *
 * Closes the [[feedback_mcp_template_management]] memory gap. Daniel's
 * weekly authoring flow is "clone last week + tweak a few songs" — but
 * "last week" is a real setlist on the calendar, not a re-usable shape.
 * `clone_setlist` works for short-cycle copies; templates encode the
 * service kind itself ("Randy Shabbat morning", "B'nai Mitzvah", "Shir
 * Shabbat") as a re-usable starting point distinct from any one service
 * date. `clone_setlist_from_template` is what David's weekly flow
 * actually wants.
 *
 * Data model: `setlistTemplates/{templateId}` is a NEW Firestore
 * collection, distinct from `setlists/{setlistId}`. Tracks are embedded
 * in the template doc as `tracks: TrackTemplate[]` rather than in the
 * top-level `tracks` collection — templates are small (10-30 rows),
 * never broadcast, never queried by `setlistId`, so the normalization
 * that justifies separate `tracks` docs for live setlists doesn't pay
 * off here. On `clone_setlist_from_template` the embedded rows become
 * real top-level `tracks` docs in one atomic batch.
 *
 * Role gate: admin OR band_leader on every tool (no read-without-write
 * mode — templates are an authoring surface). Trusted-leader rate-limit
 * bypass per [[feedback_admin_rate_limit_bypass]]. Rich envelope on
 * every refusal/validation.
 */

type DB = FirebaseFirestore.Firestore

const COLLECTION = "setlistTemplates"
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Track-row fields safe to copy verbatim from template → real setlist. */
const COPYABLE_TRACK_FIELDS = [
    "type",
    "title",
    "key",
    "bpm",
    "leadMusician",
    "referenceLink",
    "notes",
    "songId",
    "fileId",
    "fileName",
] as const

type CopyableTrackField = (typeof COPYABLE_TRACK_FIELDS)[number]

export interface TemplateTrack {
    type?: string
    title?: string
    key?: string | null
    bpm?: number | null
    leadMusician?: string | null
    referenceLink?: string | null
    notes?: string | null
    songId?: string | null
    fileId?: string | null
    fileName?: string | null
}

function toTimestamp(value: string): Timestamp {
    if (DATE_ONLY_RE.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0, 0))
    }
    return Timestamp.fromDate(new Date(value))
}

async function ownerNameFor(db: DB, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

/**
 * Trusted-leader rate-limit bypass per [[feedback_admin_rate_limit_bypass]].
 * Returns a rich-envelope `rate_limited` if the caller is over budget.
 */
async function rateLimitGate(
    db: DB,
    uid: string,
): Promise<RichErrorEnvelope | null> {
    const role = await readUserRole(db, uid)
    const bypass = role === "admin" || role === "band_leader"
    const limited = await checkUserRateLimit(uid, "api", { bypass })
    if (limited) return richError("rate_limited", limited.error, undefined, undefined)
    return null
}

function isoOfMaybeTimestamp(value: unknown): string | null {
    if (typeof value === "string") return value
    if (
        value &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof (value as { toDate: unknown }).toDate === "function"
    ) {
        try {
            return (value as { toDate(): Date }).toDate().toISOString()
        } catch {
            return null
        }
    }
    return null
}

/**
 * Filter a TemplateTrack input down to the writable subset + apply
 * defensive defaults. Matches `clone_setlist`'s pattern — every track
 * row gets at least a `title` and `type` so the editor can render it
 * after the template is cloned into a real setlist.
 */
function normalizeTemplateTrack(input: TemplateTrack | undefined): Record<string, unknown> {
    const row: Record<string, unknown> = {}
    if (!input || typeof input !== "object") {
        row.title = ""
        row.type = "song"
        return row
    }
    for (const field of COPYABLE_TRACK_FIELDS) {
        const v = (input as Record<string, unknown>)[field]
        if (v !== undefined && v !== null) row[field] = v
    }
    if (typeof row.title !== "string") row.title = ""
    if (typeof row.type !== "string") row.type = "song"
    return row
}

// ─── list_templates ─────────────────────────────────────────────────────────

export interface ListTemplatesArgs {
    templateType?: string
    ownerUid?: string
}

export interface TemplateSummary {
    templateId: string
    name: string
    templateType: string | null
    trackCount: number
    ownerId: string
    ownerName: string
    updatedAt: string | null
    version: number
}

export interface ListTemplatesResult {
    ok: true
    templates: TemplateSummary[]
    total: number
}

export async function listTemplates(
    uid: string,
    args: ListTemplatesArgs = {},
): Promise<ListTemplatesResult | RichErrorEnvelope> {
    initAdmin()
    const db = getFirestore()

    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    let query: FirebaseFirestore.Query = db.collection(COLLECTION)
    if (typeof args.templateType === "string" && args.templateType.trim()) {
        query = query.where("templateType", "==", args.templateType.trim())
    }
    if (typeof args.ownerUid === "string" && args.ownerUid.trim()) {
        query = query.where("ownerId", "==", args.ownerUid.trim())
    }
    const snap = await query.get()
    const templates: TemplateSummary[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        const tracks = Array.isArray(data.tracks) ? (data.tracks as unknown[]) : []
        return {
            templateId: d.id,
            name: typeof data.name === "string" ? data.name : "",
            templateType:
                typeof data.templateType === "string" ? data.templateType : null,
            trackCount: tracks.length,
            ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
            ownerName:
                typeof data.ownerName === "string" ? data.ownerName : "",
            updatedAt: isoOfMaybeTimestamp(data.updatedAt),
            version: typeof data.version === "number" ? data.version : 1,
        }
    })
    templates.sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    )
    return { ok: true, templates, total: templates.length }
}

// ─── get_template ───────────────────────────────────────────────────────────

export interface GetTemplateResult {
    ok: true
    templateId: string
    name: string
    templateType: string | null
    serviceNotes: string | null
    tracks: TemplateTrack[]
    ownerId: string
    ownerName: string
    createdAt: string | null
    updatedAt: string | null
    version: number
}

export async function getTemplate(
    uid: string,
    templateId: string,
): Promise<GetTemplateResult | RichErrorEnvelope> {
    if (!templateId?.trim()) {
        return richError(
            "invalid_argument",
            "templateId is required.",
            { templateId: templateId ?? null },
            "Pass a non-empty templateId from list_templates.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const snap = await db.collection(COLLECTION).doc(templateId).get()
    if (!snap.exists) {
        return richError(
            "template_not_found",
            `Template '${templateId}' was not found.`,
            { templateId },
            "Verify the id via list_templates.",
        )
    }
    const data = snap.data() as Record<string, unknown>
    const tracks = Array.isArray(data.tracks)
        ? (data.tracks as Record<string, unknown>[]).map((t) => {
              const row: TemplateTrack = {}
              for (const field of COPYABLE_TRACK_FIELDS) {
                  const v = t[field]
                  if (v !== undefined && v !== null) {
                      ;(row as Record<string, unknown>)[field] = v
                  }
              }
              return row
          })
        : []
    return {
        ok: true,
        templateId: snap.id,
        name: typeof data.name === "string" ? data.name : "",
        templateType:
            typeof data.templateType === "string" ? data.templateType : null,
        serviceNotes:
            typeof data.serviceNotes === "string" ? data.serviceNotes : null,
        tracks,
        ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
        ownerName:
            typeof data.ownerName === "string" ? data.ownerName : "",
        createdAt: isoOfMaybeTimestamp(data.createdAt),
        updatedAt: isoOfMaybeTimestamp(data.updatedAt),
        version: typeof data.version === "number" ? data.version : 1,
    }
}

// ─── create_template ────────────────────────────────────────────────────────

export interface CreateTemplateArgs {
    name: string
    templateType?: string
    serviceNotes?: string
    tracks?: TemplateTrack[]
}

export interface CreateTemplateResult {
    ok: true
    templateId: string
    name: string
    templateType: string | null
    ownerId: string
    ownerName: string
    trackCount: number
    version: 1
}

export async function createTemplate(
    uid: string,
    args: CreateTemplateArgs,
): Promise<CreateTemplateResult | RichErrorEnvelope> {
    if (typeof args?.name !== "string" || !args.name.trim()) {
        return richError(
            "invalid_argument",
            "`name` is required.",
            { name: args?.name ?? null },
            "Pass a non-empty name for the template.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const templateId = crypto.randomUUID()
    const ownerName = await ownerNameFor(db, uid)
    const tracks = Array.isArray(args.tracks)
        ? args.tracks.map((t) => normalizeTemplateTrack(t))
        : []

    const payload: Record<string, unknown> = {
        id: templateId,
        name: args.name.trim(),
        ownerId: uid,
        ownerName,
        tracks,
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }
    if (typeof args.templateType === "string" && args.templateType.trim()) {
        payload.templateType = args.templateType.trim()
    }
    if (typeof args.serviceNotes === "string") {
        payload.serviceNotes = args.serviceNotes
    }

    await db.collection(COLLECTION).doc(templateId).set(payload)
    logger.info("[mcp] create_template committed", {
        templateId,
        ownerId: uid,
        trackCount: tracks.length,
        templateType: payload.templateType ?? null,
    })

    return {
        ok: true,
        templateId,
        name: args.name.trim(),
        templateType:
            typeof payload.templateType === "string"
                ? payload.templateType
                : null,
        ownerId: uid,
        ownerName,
        trackCount: tracks.length,
        version: 1,
    }
}

// ─── update_template ────────────────────────────────────────────────────────

export interface UpdateTemplatePatch {
    name?: string
    templateType?: string | null
    serviceNotes?: string | null
    tracks?: TemplateTrack[]
}

export interface UpdateTemplateArgs {
    templateId: string
    patch: UpdateTemplatePatch
}

export interface UpdateTemplateResult {
    ok: true
    templateId: string
    changed: boolean
    version: number
}

function patchHasChange(
    existing: Record<string, unknown>,
    patch: UpdateTemplatePatch,
): boolean {
    if (typeof patch.name === "string" && patch.name.trim() !== existing.name) {
        return true
    }
    if (Object.prototype.hasOwnProperty.call(patch, "templateType")) {
        const next = patch.templateType ?? null
        const existingTemplateType =
            typeof existing.templateType === "string"
                ? existing.templateType
                : null
        if (next !== existingTemplateType) return true
    }
    if (Object.prototype.hasOwnProperty.call(patch, "serviceNotes")) {
        const next = patch.serviceNotes ?? null
        const existingNotes =
            typeof existing.serviceNotes === "string"
                ? existing.serviceNotes
                : null
        if (next !== existingNotes) return true
    }
    if (Array.isArray(patch.tracks)) {
        const existingTracks = Array.isArray(existing.tracks)
            ? (existing.tracks as Record<string, unknown>[])
            : []
        const nextTracks = patch.tracks.map((t) => normalizeTemplateTrack(t))
        if (existingTracks.length !== nextTracks.length) return true
        for (let i = 0; i < nextTracks.length; i++) {
            const a = existingTracks[i] ?? {}
            const b = nextTracks[i]
            for (const field of COPYABLE_TRACK_FIELDS) {
                if ((a[field] ?? null) !== ((b as Record<string, unknown>)[field] ?? null)) {
                    return true
                }
            }
        }
    }
    return false
}

export async function updateTemplate(
    uid: string,
    args: UpdateTemplateArgs,
): Promise<UpdateTemplateResult | RichErrorEnvelope> {
    if (!args?.templateId?.trim()) {
        return richError(
            "invalid_argument",
            "templateId is required.",
            { templateId: args?.templateId ?? null },
            "Pass a non-empty templateId from list_templates.",
        )
    }
    if (!args.patch || typeof args.patch !== "object") {
        return richError(
            "invalid_argument",
            "`patch` is required and must be an object.",
            { patch: args.patch ?? null },
            "Pass at least one of: name, templateType, serviceNotes, tracks.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const ref = db.collection(COLLECTION).doc(args.templateId)
    const snap = await ref.get()
    if (!snap.exists) {
        return richError(
            "template_not_found",
            `Template '${args.templateId}' was not found.`,
            { templateId: args.templateId },
            "Verify the id via list_templates.",
        )
    }
    const existing = snap.data() as Record<string, unknown>
    const existingVersion =
        typeof existing.version === "number" ? existing.version : 1

    if (!patchHasChange(existing, args.patch)) {
        return {
            ok: true,
            templateId: args.templateId,
            changed: false,
            version: existingVersion,
        }
    }

    const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        version: existingVersion + 1,
    }
    if (typeof args.patch.name === "string" && args.patch.name.trim()) {
        update.name = args.patch.name.trim()
    }
    if (Object.prototype.hasOwnProperty.call(args.patch, "templateType")) {
        update.templateType = args.patch.templateType ?? FieldValue.delete()
    }
    if (Object.prototype.hasOwnProperty.call(args.patch, "serviceNotes")) {
        update.serviceNotes = args.patch.serviceNotes ?? FieldValue.delete()
    }
    if (Array.isArray(args.patch.tracks)) {
        update.tracks = args.patch.tracks.map((t) => normalizeTemplateTrack(t))
    }

    await ref.update(update)
    logger.info("[mcp] update_template committed", {
        templateId: args.templateId,
        ownerId: existing.ownerId,
        callerId: uid,
        newVersion: existingVersion + 1,
    })

    return {
        ok: true,
        templateId: args.templateId,
        changed: true,
        version: existingVersion + 1,
    }
}

// ─── delete_template ────────────────────────────────────────────────────────

export interface DeleteTemplateResult {
    ok: true
    templateId: string
    deleted: boolean
}

export async function deleteTemplate(
    uid: string,
    templateId: string,
): Promise<DeleteTemplateResult | RichErrorEnvelope> {
    if (!templateId?.trim()) {
        return richError(
            "invalid_argument",
            "templateId is required.",
            { templateId: templateId ?? null },
            "Pass a non-empty templateId from list_templates.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const ref = db.collection(COLLECTION).doc(templateId)
    const snap = await ref.get()
    if (!snap.exists) {
        // Idempotent — already-gone is a successful no-op for the caller.
        return { ok: true, templateId, deleted: false }
    }
    await ref.delete()
    logger.info("[mcp] delete_template committed", {
        templateId,
        callerId: uid,
    })
    return { ok: true, templateId, deleted: true }
}

// ─── create_template_from_setlist ───────────────────────────────────────────

export interface CreateTemplateFromSetlistArgs {
    setlistId: string
    name: string
    templateType?: string | null
    copyServiceNotes?: boolean
}

export interface CreateTemplateFromSetlistResult {
    ok: true
    templateId: string
    sourceSetlistId: string
    name: string
    templateType: string | null
    ownerId: string
    ownerName: string
    trackCount: number
    version: 1
}

/**
 * Cycle-7-fixes Lane 4 sub-task B (C7I1-007). Inverts
 * `clone_setlist_from_template`: snapshots an existing setlist's tracks
 * into a new `setlistTemplates/{templateId}` document. The caller becomes
 * the template owner (NOT the source setlist owner) so the template is
 * editable by the person who chose to template-ify it.
 */
export async function createTemplateFromSetlist(
    uid: string,
    args: CreateTemplateFromSetlistArgs,
): Promise<CreateTemplateFromSetlistResult | RichErrorEnvelope> {
    if (!args?.setlistId?.trim()) {
        return richError(
            "invalid_argument",
            "setlistId is required.",
            { setlistId: args?.setlistId ?? null },
            "Pass a non-empty setlistId of the source setlist.",
        )
    }
    if (typeof args.name !== "string" || !args.name.trim()) {
        return richError(
            "invalid_argument",
            "`name` is required.",
            { name: args.name ?? null },
            "Pass a non-empty name for the new template.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const setlistRef = db.collection("setlists").doc(args.setlistId)
    const setlistSnap = await setlistRef.get()
    if (!setlistSnap.exists) {
        return richError(
            "setlist_not_found",
            `Setlist '${args.setlistId}' was not found.`,
            { setlistId: args.setlistId },
            "Verify the id via list_setlists.",
        )
    }
    const setlist = setlistSnap.data() as Record<string, unknown>

    const tracksSnap = await db
        .collection("tracks")
        .where("setlistId", "==", args.setlistId)
        .get()
    const tracks: Record<string, unknown>[] = tracksSnap.docs
        .map((d) => d.data() as Record<string, unknown>)
        .sort((a, b) => {
            const ao = typeof a.order === "number" ? a.order : 0
            const bo = typeof b.order === "number" ? b.order : 0
            return ao - bo
        })
        .map((t) => normalizeTemplateTrack(t as TemplateTrack))

    const templateId = crypto.randomUUID()
    const ownerName = await ownerNameFor(db, uid)
    const copyServiceNotes = args.copyServiceNotes !== false

    const payload: Record<string, unknown> = {
        id: templateId,
        name: args.name.trim(),
        ownerId: uid,
        ownerName,
        tracks,
        version: 1,
        sourceSetlistId: args.setlistId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }

    // templateType arg overrides; null/undefined → no field. If arg
    // entirely omitted, carry over the source setlist's templateType if
    // it has one (most common shape: template-ify an existing service
    // and want to keep the service-kind label).
    if (Object.prototype.hasOwnProperty.call(args, "templateType")) {
        if (typeof args.templateType === "string" && args.templateType.trim()) {
            payload.templateType = args.templateType.trim()
        }
    } else if (typeof setlist.templateType === "string") {
        payload.templateType = setlist.templateType
    }

    if (copyServiceNotes && typeof setlist.serviceNotes === "string") {
        payload.serviceNotes = setlist.serviceNotes
    }

    await db.collection(COLLECTION).doc(templateId).set(payload)
    logger.info("[mcp] create_template_from_setlist committed", {
        templateId,
        sourceSetlistId: args.setlistId,
        ownerId: uid,
        trackCount: tracks.length,
        templateType: payload.templateType ?? null,
    })

    return {
        ok: true,
        templateId,
        sourceSetlistId: args.setlistId,
        name: args.name.trim(),
        templateType:
            typeof payload.templateType === "string"
                ? payload.templateType
                : null,
        ownerId: uid,
        ownerName,
        trackCount: tracks.length,
        version: 1,
    }
}

// ─── clone_setlist_from_template ────────────────────────────────────────────

export interface CloneSetlistFromTemplateArgs {
    templateId: string
    newName: string
    newEventDate?: string | null
    copyServiceNotes?: boolean
}

export interface CloneSetlistFromTemplateResult {
    ok: true
    setlistId: string
    sourceTemplateId: string
    trackCount: number
    ownerId: string
    ownerName: string
    version: 1
}

export async function cloneSetlistFromTemplate(
    uid: string,
    args: CloneSetlistFromTemplateArgs,
): Promise<CloneSetlistFromTemplateResult | RichErrorEnvelope> {
    if (!args?.templateId?.trim()) {
        return richError(
            "invalid_argument",
            "templateId is required.",
            { templateId: args?.templateId ?? null },
            "Pass a non-empty templateId from list_templates.",
        )
    }
    if (typeof args.newName !== "string" || !args.newName.trim()) {
        return richError(
            "invalid_argument",
            "`newName` is required.",
            { newName: args.newName ?? null },
            "Pass a non-empty name for the new setlist.",
        )
    }
    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor
    const limit = await rateLimitGate(db, uid)
    if (limit) return limit

    const templateRef = db.collection(COLLECTION).doc(args.templateId)
    const templateSnap = await templateRef.get()
    if (!templateSnap.exists) {
        return richError(
            "template_not_found",
            `Template '${args.templateId}' was not found.`,
            { templateId: args.templateId },
            "Verify the id via list_templates.",
        )
    }
    const template = templateSnap.data() as Record<string, unknown>
    const templateTracks = Array.isArray(template.tracks)
        ? (template.tracks as Record<string, unknown>[])
        : []

    const ownerName = await ownerNameFor(db, uid)
    const newSetlistId = crypto.randomUUID()
    const copyServiceNotes = args.copyServiceNotes !== false

    // C11M1-001: denormalize songCount on the new setlist — same rule as
    // clone_setlist + every server-tracks-write mutation. Templates store
    // tracks inline; payload.type defaults to "song" downstream so isSongType
    // on the source row (which may be undefined → song) is the correct count.
    const templateSongCount = templateTracks.filter((t) =>
        isSongType((t as Record<string, unknown>).type),
    ).length
    const setlistPayload: Record<string, unknown> = {
        id: newSetlistId,
        name: args.newName.trim(),
        date: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        trackCount: templateTracks.length,
        songCount: templateSongCount,
        hydrated: true,
        ownerId: uid,
        ownerName,
        version: 1,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: uid,
        sourceTemplateId: args.templateId,
    }

    if (args.newEventDate !== undefined && args.newEventDate !== null) {
        if (!args.newEventDate.trim()) {
            return richError(
                "invalid_argument",
                "newEventDate must be a non-empty ISO date.",
                { newEventDate: args.newEventDate },
                "Pass a YYYY-MM-DD or full ISO date string, or omit to skip the override.",
            )
        }
        if (Number.isNaN(Date.parse(args.newEventDate))) {
            return richError(
                "invalid_argument",
                `newEventDate must be an ISO date string (got "${args.newEventDate}").`,
                { newEventDate: args.newEventDate },
                "Pass a YYYY-MM-DD or full ISO date string.",
            )
        }
        setlistPayload.eventDate = toTimestamp(args.newEventDate)
    }

    if (typeof template.templateType === "string") {
        setlistPayload.templateType = template.templateType
    }
    if (copyServiceNotes && typeof template.serviceNotes === "string") {
        setlistPayload.serviceNotes = template.serviceNotes
    }

    const canonicalFileIds = new Set<string>()
    for (const t of templateTracks) {
        const fid = (t as Record<string, unknown>).fileId
        if (typeof fid === "string" && fid) canonicalFileIds.add(fid)
    }
    if (canonicalFileIds.size > 0) {
        setlistPayload.fileIds = [...canonicalFileIds]
    }

    const batch = db.batch()
    batch.set(db.collection("setlists").doc(newSetlistId), setlistPayload)

    const nowIso = new Date().toISOString()
    templateTracks.forEach((src, i) => {
        const newTrackId = crypto.randomUUID()
        const payload: Record<string, unknown> = {
            id: newTrackId,
            setlistId: newSetlistId,
            order: i,
            version: 1,
            lastModifiedAt: nowIso,
        }
        for (const field of COPYABLE_TRACK_FIELDS) {
            const v = (src as Record<CopyableTrackField, unknown>)[field]
            if (v !== undefined && v !== null) payload[field] = v
        }
        if (typeof payload.title !== "string") payload.title = ""
        if (typeof payload.type !== "string") payload.type = "song"
        batch.set(db.collection("tracks").doc(newTrackId), payload)
    })

    await batch.commit()
    logger.info("[mcp] clone_setlist_from_template committed", {
        sourceTemplateId: args.templateId,
        newSetlistId,
        trackCount: templateTracks.length,
        copiedFileIds: canonicalFileIds.size,
    })

    return {
        ok: true,
        setlistId: newSetlistId,
        sourceTemplateId: args.templateId,
        trackCount: templateTracks.length,
        ownerId: uid,
        ownerName,
        version: 1,
    }
}
