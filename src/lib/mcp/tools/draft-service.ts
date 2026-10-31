import "server-only"

import { hidesLiturgicalFields } from "@/lib/org/vocab"
import crypto from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { bookSlugGuard } from "@/lib/mcp/liturgy-ref-guard"
import { loadLibraryLite } from "@/lib/history/load"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { getBook } from "@/lib/books/registry"
import { isSongType } from "@/lib/setlist-track-count"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { profileKeyFor, rabbiRequired, serviceLabelFor } from "@/lib/profiles/keys"
import {
    applyChoices,
    annotateCharts,
    buildDraftRows,
    defaultSpecial,
    DRAFT_TTL_MS,
    filledNoteFor,
    oneOffNoteFor,
    openIndexesOf,
    type ChartInfo,
    type DraftChoice,
    type DraftRow,
    type DraftWarning,
    type Recall,
} from "@/lib/profiles/draft"
import {
    buildReadback,
    monthDay,
    serviceNoun,
    settingOf,
    type OpenItem,
    type Readback,
    type ReadbackRow,
} from "@/lib/profiles/readback"
import { seedProfile } from "@/lib/profiles/seed"
import { buildSlotUses, existingOnDate, loadMemoryHistory } from "@/lib/profiles/slot-uses"
import { vsLastOf, type VsLast } from "@/lib/profiles/vs-last"
import { writeStanding } from "@/lib/profiles/standing"
import type { Promotion, Tier } from "@/lib/profiles/tiers"
import { readOpenItems } from "./open-items"
import { cacheLearnedProfile, coreProfileFor, findLegacyTemplate, findProfileTemplateFor, tierProfileRows } from "./service-profiles"
import { profileLabelFor, setAnnouncement } from "./standing"
import { rateLimitGate, writeSetlistFromTemplateRows, type TemplateProfile, type UnresolvedLiturgyRow } from "./templates"

/**
 * Setlist memory, release 2 — `draft_service` and `create_setlist_from_draft`.
 *
 * draft_service drafts a service from its living profile: a song slot is
 * filled only when it is standard (someone said "keep it") or usual (the same
 * chart on 3 of the last 5 regular services); every other slot is drafted open
 * and listed. The draft is stored in `service_drafts` for 30 minutes; nothing
 * is on the calendar until create_setlist_from_draft writes the setlist the
 * way clone_setlist_from_template does, remembers each `standing: true`
 * choice and deletes the draft. Tenant-scoped; admin or band_leader.
 */

export const DRAFTS_COLLECTION = "service_drafts"

type DB = FirebaseFirestore.Firestore

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Firestore refuses `undefined`; drop it at every depth. */
function clean<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T
}

async function displayNameFor(db: DB, uid: string): Promise<string> {
    try {
        const snap = await db.collection("users").doc(uid).get()
        const d = snap.exists ? snap.data() : null
        const name = d?.displayName ?? d?.name ?? d?.email
        return typeof name === "string" && name.trim() ? name : "MCP User"
    } catch {
        return "MCP User"
    }
}

// ─── draft_service ──────────────────────────────────────────────────────────

export interface DraftServiceArgs {
    date: string
    serviceType: string
    rabbiSlot?: string | null
    special?: boolean
    name?: string
}

export interface DraftServiceRowOut {
    index: number
    label: string
    type: string
    slotKey: string | null
    fileId?: string
    chartName?: string
    key?: string | null
    writtenKey?: string | null
    tier: Tier | null
    phrase: string | null
    promotion?: Promotion
    /** Open slots: the chart this slot had before, to reuse with `{index, useRecall: true}`. Never filled. */
    recall?: Recall
    /** The per-part charts of a slot that had several rows (piano, lyrics, lead sheet). */
    parts?: Array<{ fileId: string; chartName: string; title: string }>
}

export interface DraftServiceResult {
    ok: true
    draftId: string
    expiresAt: string
    profile: { key: string; label: string; book: string | null }
    /** Where the running order came from: the last regular services, the saved profile, or a legacy template. */
    origin: DraftOrigin
    special: boolean
    rows: DraftServiceRowOut[]
    openIndexes: number[]
    truncated: boolean
    /** Setlists already on this date for this service. A warning only: the draft still creates. */
    existing: { setlistId: string; name: string }[]
    /** MCP-05: per slot, what the profile's last regular service had. Recall only. */
    vsLast: VsLast | null
    /** dead_chart and key_mismatch notes on filled rows. Warnings only. */
    warnings: DraftWarning[]
    /** The draft said aloud, exceptions first (release 3). */
    readback: Readback
}

interface StoredDraft {
    orgId: OrgId
    uid: string
    profileKey: string
    profileLabel: string
    templateId: string
    serviceType: string
    rabbiSlot: string | null
    book: string | null
    serviceNotes: string | null
    date: string
    special: boolean
    name: string | null
    rows: DraftRow[]
    createdAt: string
    expiresAt: Timestamp
    /** Set while create_setlist_from_draft is creating the setlist. */
    claimId?: string
}

function rowOut(r: DraftRow): DraftServiceRowOut {
    const out: DraftServiceRowOut = {
        index: r.index,
        label: r.label,
        type: r.type,
        slotKey: r.slotKey,
        tier: r.tier,
        phrase: r.phrase,
    }
    if (r.fileId) out.fileId = r.fileId
    if (r.chartName) out.chartName = r.chartName
    if (r.fileId) out.key = r.key ?? null
    if (r.fileId && r.writtenKey !== undefined) out.writtenKey = r.writtenKey
    if (r.promotion) out.promotion = r.promotion
    if (r.recall) out.recall = r.recall
    if (r.parts) out.parts = r.parts
    return out
}

export async function draftServiceTool(
    uid: string,
    args: DraftServiceArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<DraftServiceResult | RichErrorEnvelope> {
    const date = str(args?.date)
    const serviceType = str(args?.serviceType)
    if (!date || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
        return richError("invalid_argument", "Pass `date` as YYYY-MM-DD.", { fields: ["date"] }, "e.g. '2026-11-07'.")
    }
    if (!serviceType) {
        return richError("invalid_argument", "Pass `serviceType`.", { fields: ["serviceType"] }, "e.g. 'shabbat_morning'.")
    }
    const askedRabbi = str(args?.rabbiSlot)
    if (rabbiRequired(serviceType) && !askedRabbi) {
        return richError(
            "rabbi_required",
            "This service's music depends on the rabbi, and no rabbi was given.",
            { serviceType },
            "Ask the person building the setlist who is leading: Daniel/Karen or Randy. Never infer it.",
        )
    }
    // A service not split by rabbi has one profile whoever leads it.
    const rabbiSlot = rabbiRequired(serviceType) ? askedRabbi : null
    const profileKey = profileKeyFor(serviceType, rabbiSlot)
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor

        const zone = orgTimeZone(org)
        const dayOf = (iso: string) => {
            const t = Date.parse(iso)
            return Number.isNaN(t) ? iso.slice(0, 10) : dayInZone(t, zone)
        }
        const now = new Date()
        const def = coreProfileFor(org, profileKey)
        const memory = await loadMemoryHistory(org)
        // Brothers Lazaroff keeps song slots: no title lookup outside CRC.
        const byTitle = org === DEFAULT_ORG_ID
        const index = buildSlotUses(memory.setlists, memory.library, { serviceType, rabbiSlot, before: date, byTitle })
        // MCP-03: the running order is re-learned from the last regular services on every draft.
        const learned = def ? seedProfile(def, memory.setlists, memory.library, now, { before: date, byTitle }) : null
        const doc = await findProfileTemplateFor(org, profileKey)
        const stored = doc?.data()
        const storedProfile = (stored?.profile ?? null) as TemplateProfile | null
        const label = def?.label ?? storedProfile?.label ?? profileLabelFor(profileKey, serviceType)
        const book = def?.book ?? storedProfile?.book ?? null
        const catalogLabel = serviceLabelFor(serviceType) ?? serviceType

        let tracks: Record<string, unknown>[]
        let templateId: string
        let serviceNotes: string | null = typeof stored?.serviceNotes === "string" ? stored.serviceNotes : null
        let origin: DraftOrigin
        if (def && learned?.learnedFrom) {
            // The profile doc is a cache: refresh it for a current draft, never from a past date's view.
            // A past date's view never creates or rewrites it.
            const current = date >= dayInZone(now.getTime(), zone)
            templateId = current ? await cacheLearnedProfile(uid, org, def, learned, doc) : (doc?.id ?? `profile__${org}__${def.key}`)
            tracks = learned.tracks as unknown as Record<string, unknown>[]
            const dates = learned.learnedFrom.setlists.map((s) => dayOf(s.eventDate))
            origin = { kind: "history", count: learned.learnedFrom.count, from: dates[dates.length - 1], to: dates[0], setlists: learned.learnedFrom.setlists.map((s) => s.setlistId) }
        } else if (doc) {
            tracks = Array.isArray(stored?.tracks) ? (stored!.tracks as Record<string, unknown>[]) : []
            templateId = doc.id
            origin = { kind: "saved_profile" }
        } else {
            // MCP-15: no history yet — a matching legacy template gives the order, open slots only.
            const legacy = def ? await findLegacyTemplate(org, def) : null
            if (!legacy) {
                return richError(
                    "no_profile",
                    hidesLiturgicalFields(org)
                        ? `There is no profile for '${profileKey}' yet: no past set is marked with this kind of gig, and no template matches it.`
                        : `There is no profile for '${profileKey}' yet: no past setlist is marked with this service and rabbi, and no template matches it.`,
                    { profileKey },
                    hidesLiturgicalFields(org)
                        ? "Build this one from a template or a recent set with clone_setlist. The next draft_service for this kind of gig learns from it."
                        : "Build this one from a template or a recent setlist (clone_setlist or create_setlist with serviceType and rabbiSlot set). The next draft_service for this service learns from it.",
                )
            }
            tracks = legacy.tracks.map(openTemplateRow)
            templateId = legacy.id
            serviceNotes = legacy.serviceNotes
            origin = { kind: "template", templateId: legacy.id, name: legacy.name }
        }

        const loadedRows = await tierProfileRows(org, tracks, profileKey, index)
        const rows = buildDraftRows(
            loadedRows.map((r) => ({
                index: r.index,
                type: r.type,
                title: r.title,
                slotKey: r.slotKey,
                track: r.track,
                // A legacy template gives the order only: no tier, so nothing is filled.
                tier: origin.kind === "template" ? undefined : r.tier,
                standing: origin.kind === "template" ? null : (r.standing ?? null),
                service: catalogLabel,
                otherService: r.slotKey ? (index.otherUses(r.slotKey)[0]?.serviceLabel ?? null) : null,
            })),
            dayOf,
        )
        const filledIds = rows.map((r) => r.fileId).filter((f): f is string => !!f)
        const warnings = annotateCharts(rows, await loadLibraryLite(org, filledIds))
        const special = typeof args.special === "boolean" ? args.special : defaultSpecial(serviceType)
        const existing = existingOnDate(memory.setlists, date, serviceType, zone)

        // MCP-21: the profile's previous setlist — its unresolved open items carry into this
        // readback, and a book other than the profile's is said.
        const previous = index.profileSetlists[0] ?? null
        const carried = previous ? await carriedOpenItems(db, org, previous.id, dayOf(previous.eventDate!)) : []
        const notices: Array<{ kind: "book_differs" | "dropped"; text: string }> = []
        // A row of the latest service the learned order leaves out is said, never silent.
        for (const d of learned?.learnedFrom ? (learned.dropped ?? []) : []) {
            notices.push({ kind: "dropped", text: `Dropped: ${d.label} (in ${d.count} of the last ${d.of} services)` })
        }
        if (previous?.book && book && previous.book !== book) {
            notices.push({
                kind: "book_differs",
                text: `Book differs from profile: your last ${label} (${monthDay(dayOf(previous.eventDate!))}) used ${bookName(previous.book)}; the profile uses ${bookName(book)}`,
            })
        }
        const vsLast = vsLastOf(index.profileSetlists, memory.library, { before: date, dayOf, byTitle })

        const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS)
        const ref = db.collection(DRAFTS_COLLECTION).doc(crypto.randomUUID())
        const storedDraft: StoredDraft = {
            orgId: org,
            uid,
            profileKey,
            profileLabel: label,
            templateId,
            serviceType,
            rabbiSlot: askedRabbi,
            book,
            serviceNotes,
            date,
            special,
            name: str(args.name),
            rows: clean(rows),
            createdAt: now.toISOString(),
            expiresAt: Timestamp.fromDate(expiresAt),
        }
        await ref.set(storedDraft)
        const learnedCount = origin.kind === "history" ? origin.count : null
        const readback = buildReadback({
            timeZone: zone,
            profileLabel: label,
            date,
            book,
            special,
            origin: originSentence(origin, serviceType, catalogLabel),
            notices,
            rows: rows.map((r, i) => {
                const lr = loadedRows[i]
                const choice = lr?.standing
                const out: ReadbackRow = {
                    index: r.index,
                    label: r.label,
                    isSong: r.type === "song",
                    hasChart: !!r.fileId,
                    tier: r.tier,
                    phrase: r.phrase,
                    keyOnRecord: r.key != null,
                    standing: choice ? { byName: choice.byName, at: choice.at } : null,
                    promotion: r.promotion,
                    deadChart: warnings.find((w) => w.kind === "dead_chart" && w.index === r.index)?.text,
                    keyMismatch: warnings.find((w) => w.kind === "key_mismatch" && w.index === r.index)?.text,
                }
                if (r.filled) {
                    const note = filledNoteFor(origin.kind === "template" ? undefined : lr?.tier, date, learnedCount, dayOf)
                    if (note) out.filled = note
                }
                if (r.recall) {
                    out.recall = {
                        setting: settingOf(r.recall.chartName, lr?.tier?.setting),
                        key: r.recall.key,
                        date: r.recall.date,
                        serviceLabel: r.recall.service,
                    }
                }
                return out
            }),
            openItems: carried,
            existing,
            now,
        })
        return {
            ok: true,
            draftId: ref.id,
            expiresAt: expiresAt.toISOString(),
            profile: { key: profileKey, label, book },
            origin,
            special,
            rows: rows.map(rowOut),
            openIndexes: openIndexesOf(rows),
            truncated: memory.truncated,
            existing,
            vsLast,
            warnings: [
                ...existing.map((e): DraftWarning => ({ kind: "existing", index: null, text: `There is already a setlist on this date: ${e.name}` })),
                ...warnings,
            ],
            readback,
        }
    } catch (error) {
        logger.warn("draft_service failed:", error)
        return richError(
            "internal_error",
            "Could not draft the service.",
            { errorCode: 500 },
            "Retry; nothing was created.",
        )
    }
}

/** Where a draft's running order came from. */
export type DraftOrigin =
    | { kind: "history"; count: number; from: string; to: string; setlists: string[] }
    | { kind: "saved_profile" }
    | { kind: "template"; templateId: string; name: string }

/** The headline line that says where the order came from (MCP-03, MCP-15). */
export function originSentence(origin: DraftOrigin, serviceType: string, catalogLabel: string): string {
    switch (origin.kind) {
        case "history":
            return origin.count === 1
                ? `Order from your one regular ${serviceNoun(serviceType, catalogLabel, 1)}, ${monthDay(origin.to)}.`
                : `Order from your last ${origin.count} regular ${serviceNoun(serviceType, catalogLabel, origin.count)}, ${monthDay(origin.from)} – ${monthDay(origin.to)}.`
        case "saved_profile":
            return `Order from the saved profile: no regular ${serviceNoun(serviceType, catalogLabel, 2)} before this date.`
        case "template":
            return `Order from your ${origin.name} template, with every song open: no ${serviceNoun(serviceType, catalogLabel, 1)} history yet.`
    }
}

/** A legacy template row as a draft row: its order and label, never its chart. */
function openTemplateRow(t: Record<string, unknown>): Record<string, unknown> {
    if (!isSongType(t.type)) return t
    const out: Record<string, unknown> = { ...t, type: "song", slotKind: "open" }
    for (const f of ["fileId", "fileName", "songId", "key", "leadMusician", "bpm"]) delete out[f]
    return out
}

function bookName(slug: string): string {
    return getBook(slug)?.title ?? slug
}

/** Unresolved open items of an earlier setlist, each marked with that setlist's date. */
async function carriedOpenItems(db: DB, org: OrgId, setlistId: string, day: string): Promise<OpenItem[]> {
    try {
        const snap = await db.collection("setlists").doc(setlistId).get()
        const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
        if (!data || rowOrg(data.orgId) !== org) return []
        const when = monthDay(day)
        return readOpenItems(data).map((i) => ({ ...i, text: when ? `${i.text} (from ${when})` : i.text }))
    } catch (error) {
        logger.warn("draft_service: open items of the previous setlist unreadable", error)
        return []
    }
}

// ─── create_setlist_from_draft ──────────────────────────────────────────────

export interface CreateSetlistFromDraftArgs {
    draftId: string
    name?: string
    choices?: DraftChoice[]
    /**
     * Setlist memory r4 — the book this service prays from, when it is not the
     * profile's. `null` is "no book": a B'nei Mitzvah family praying from its
     * own printed booklet gets no page numbers rather than the siddur's. Rows
     * keep pages only where the profile has one for THIS book.
     */
    book?: string | null
}

export interface CreateSetlistFromDraftResult {
    ok: true
    setlistId: string
    trackCount: number
    book: string | null
    announcements: string[]
    oneOffNote?: string
    /** Follow-up writes that failed after the setlist was created. */
    warnings?: string[]
    unresolvedLiturgy: UnresolvedLiturgyRow[]
    bondReviewCount: number
}

/** In this org, not expired, and not claimed by a create already under way. */
function draftUsable(draft: StoredDraft, org: OrgId): boolean {
    if (rowOrg(draft.orgId) !== org) return false
    const expires = draft.expiresAt instanceof Timestamp ? draft.expiresAt.toMillis() : 0
    if (expires <= Date.now()) return false
    return !draft.claimId
}

/** Undo our own claim after a create that wrote nothing (best effort). */
async function releaseClaim(ref: FirebaseFirestore.DocumentReference, claimId: string): Promise<void> {
    try {
        await ref.firestore.runTransaction(async (tx) => {
            const s = await tx.get(ref)
            if (s.exists && s.data()?.claimId === claimId) {
                tx.update(ref, { claimId: FieldValue.delete(), claimedBy: FieldValue.delete(), claimedAt: FieldValue.delete() })
            }
        })
    } catch (err) {
        logger.warn("[mcp] create_setlist_from_draft could not release its claim", {
            err: err instanceof Error ? err.message : String(err),
        })
    }
}

function draftNotFound(draftId: string): RichErrorEnvelope {
    return richError(
        "draft_not_found",
        `Draft '${draftId}' was not found or has expired.`,
        { draftId },
        "Drafts last 30 minutes. Call draft_service again.",
    )
}

export async function createSetlistFromDraftTool(
    uid: string,
    args: CreateSetlistFromDraftArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<CreateSetlistFromDraftResult | RichErrorEnvelope> {
    const draftId = str(args?.draftId)
    if (!draftId) {
        return richError("invalid_argument", "Pass `draftId`.", { fields: ["draftId"] }, "Get it from draft_service.")
    }
    const choices = Array.isArray(args?.choices) ? args.choices : []
    const bookOverride = args?.book
    if (bookOverride !== undefined && bookOverride !== null) {
        const badBook = typeof bookOverride === "string" ? bookSlugGuard(bookOverride) : null
        if (typeof bookOverride !== "string" || !bookOverride || badBook) {
            return (
                badBook ??
                richError("invalid_argument", "`book` is a book slug, or null for no book.", { book: bookOverride }, "Call list_books for valid slugs.")
            )
        }
    }
    let claimToRelease: { ref: FirebaseFirestore.DocumentReference; claimId: string } | null = null
    try {
        initAdmin()
        const db = getFirestore()
        const editor = await assertEditor(db, uid, org)
        if (!editor.ok) return editor
        const limit = await rateLimitGate(db, uid, org)
        if (limit) return limit

        const ref = db.collection(DRAFTS_COLLECTION).doc(draftId)
        const snap = await ref.get()
        if (!snap.exists || !draftUsable(snap.data() as StoredDraft, org)) return draftNotFound(draftId)
        const draft = snap.data() as StoredDraft

        const rows = Array.isArray(draft.rows) ? draft.rows : []
        const chartIds = new Set<string>()
        for (const c of choices) {
            const f = str(c?.fileId)
            if (f) chartIds.add(f)
            const rowFile = Number.isInteger(c?.index) ? str(rows[c.index]?.track?.fileId) : null
            if (rowFile) chartIds.add(rowFile)
            const recallFile = c?.useRecall === true && Number.isInteger(c?.index) ? str(rows[c.index]?.recall?.fileId) : null
            if (recallFile) chartIds.add(recallFile)
        }
        const library = await loadLibraryLite(org, [...chartIds])
        const charts = new Map<string, ChartInfo>(
            [...library.values()].map((l) => [l.fileId, { name: l.name, partGroup: l.partGroup }]),
        )
        const applied = applyChoices(rows, choices, charts)
        if (!applied.ok) {
            return richError(
                applied.code,
                applied.message,
                { draftId, index: applied.index },
                applied.code === "chart_not_found"
                    ? "Find the chart with search_library and pass its fileId."
                    : applied.code === "no_recall"
                      ? "Only an open row with `recall` can reuse it; pass fileId instead."
                      : "Choices name song rows by their draft index.",
            )
        }

        // Claim the draft before anything is written: a second call with the
        // same draftId (a retry, a double click) finds it claimed and gets
        // draft_not_found, so one draft never makes two setlists.
        const claimId = crypto.randomUUID()
        const claimed = await db.runTransaction(async (tx) => {
            const s = await tx.get(ref)
            if (!s.exists || !draftUsable(s.data() as StoredDraft, org)) return false
            tx.update(ref, { claimedBy: uid, claimId, claimedAt: Timestamp.now() })
            return true
        })
        if (!claimed) return draftNotFound(draftId)
        claimToRelease = { ref, claimId }

        const name = str(args.name) ?? draft.name ?? `${draft.profileLabel} ${draft.date}`
        // A write that throws may still have landed, so from here the claim is only released
        // on a clean refusal: a retry must never create a second setlist.
        claimToRelease = null
        const written = await writeSetlistFromTemplateRows(db, uid, org, {
            rows: applied.rows.map((r) => r.track),
            name,
            eventDate: draft.date,
            book: bookOverride !== undefined ? bookOverride : draft.book,
            templateType: draft.serviceType,
            serviceNotes: draft.serviceNotes,
            sourceTemplateId: draft.templateId,
            extraSetlistFields: {
                serviceType: draft.serviceType,
                rabbiSlot: draft.rabbiSlot ?? null,
                special: draft.special === true,
            },
            logLabel: "create_setlist_from_draft",
        })
        if (!written.ok) {
            await releaseClaim(ref, claimId)
            return written
        }
        // The setlist exists now; the follow-up writes are best-effort.
        const announcements: string[] = []
        const warnings: string[] = []
        if (applied.standing.length > 0) {
            const byName = await displayNameFor(db, uid).catch(() => "")
            for (const s of applied.standing) {
                try {
                    // One scope: the draft's own profile (see standing.ts).
                    const { choice, overrode } = await writeStanding(org, uid, {
                        scope: draft.profileKey,
                        slotKey: s.slotKey,
                        fileId: s.fileId,
                        chartName: s.chartName,
                        key: s.key,
                        partGroup: s.partGroup,
                        leadMusician: s.leadMusician,
                        byName,
                        quote: s.quote,
                    })
                    announcements.push(setAnnouncement(choice.chartName, choice.key, draft.profileLabel, overrode))
                } catch (error) {
                    logger.warn("create_setlist_from_draft: standing write failed:", error)
                    warnings.push(`Could not save ${s.chartName} as standard; use set_standing_choice on that row.`)
                }
            }
        }
        await ref.delete().catch((error) => logger.warn("create_setlist_from_draft: draft delete failed:", error))

        const out: CreateSetlistFromDraftResult = {
            ok: true,
            setlistId: written.setlistId,
            trackCount: written.trackIds.length,
            book: written.book,
            announcements,
            unresolvedLiturgy: written.unresolvedLiturgy,
            bondReviewCount: written.bondReviewCount,
        }
        const oneOffNote = oneOffNoteFor(applied.oneOff)
        if (oneOffNote) out.oneOffNote = oneOffNote
        if (warnings.length > 0) out.warnings = warnings
        return out
    } catch (error) {
        if (claimToRelease) await releaseClaim(claimToRelease.ref, claimToRelease.claimId)
        logger.warn("create_setlist_from_draft failed:", error)
        return richError(
            "internal_error",
            "Could not create the setlist from the draft.",
            { errorCode: 500 },
            "Check list_setlists first: the setlist may exist. If it doesn't, run draft_service again.",
        )
    }
}
