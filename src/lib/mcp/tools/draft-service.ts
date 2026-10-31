import "server-only"

import crypto from "crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { bookSlugGuard } from "@/lib/mcp/liturgy-ref-guard"
import { loadLibraryLite } from "@/lib/history/load"
import { orgTimeZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { profileKeyFor, rabbiRequired } from "@/lib/profiles/keys"
import {
    applyChoices,
    annotateCharts,
    buildDraftRows,
    defaultSpecial,
    DRAFT_TTL_MS,
    oneOffNoteFor,
    openIndexesOf,
    type ChartInfo,
    type DraftChoice,
    type DraftRow,
    type DraftWarning,
} from "@/lib/profiles/draft"
import { buildReadback, type Readback } from "@/lib/profiles/readback"
import { writeStanding } from "@/lib/profiles/standing"
import type { Promotion, Tier } from "@/lib/profiles/tiers"
import { findProfileTemplateFor, loadProfileTiers, seedMissingProfile } from "./service-profiles"
import { profileLabelFor, setAnnouncement } from "./standing"
import { rateLimitGate, writeSetlistFromTemplateRows, type UnresolvedLiturgyRow } from "./templates"

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
}

export interface DraftServiceResult {
    ok: true
    draftId: string
    expiresAt: string
    profile: { key: string; label: string; book: string | null }
    special: boolean
    rows: DraftServiceRowOut[]
    openIndexes: number[]
    truncated: boolean
    /** Setlists already on this date for this service. A warning only: the draft still creates. */
    existing: { setlistId: string; name: string }[]
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

        const doc = (await findProfileTemplateFor(org, profileKey)) ?? (await seedMissingProfile(uid, org, profileKey))
        if (!doc) {
            return richError(
                "no_profile",
                `There is no profile for '${profileKey}' yet: no past setlist is marked with this service and rabbi.`,
                { profileKey },
                "Build this one from a template or a recent setlist, with templateType and rabbi set. The next draft_service for this service learns from it.",
            )
        }
        const loaded = await loadProfileTiers(org, doc, serviceType, rabbiSlot, date)
        const rows = buildDraftRows(
            loaded.rows.map((r) => ({
                index: r.index,
                type: r.type,
                title: r.title,
                slotKey: r.slotKey,
                track: r.track,
                tier: r.tier,
                standing: r.standing ?? null,
            })),
        )
        const filledIds = rows.map((r) => r.fileId).filter((f): f is string => !!f)
        const warnings = annotateCharts(rows, await loadLibraryLite(org, filledIds))
        const special = typeof args.special === "boolean" ? args.special : defaultSpecial(serviceType)
        const label = loaded.profile?.label ?? profileLabelFor(profileKey, serviceType)
        const book = loaded.profile?.book ?? null
        const now = new Date()
        const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS)
        const ref = db.collection(DRAFTS_COLLECTION).doc(crypto.randomUUID())
        const stored: StoredDraft = {
            orgId: org,
            uid,
            profileKey,
            profileLabel: label,
            templateId: loaded.templateId,
            serviceType,
            rabbiSlot: askedRabbi,
            book,
            serviceNotes: loaded.serviceNotes,
            date,
            special,
            name: str(args.name),
            rows: clean(rows),
            createdAt: now.toISOString(),
            expiresAt: Timestamp.fromDate(expiresAt),
        }
        await ref.set(stored)
        const readback = buildReadback({
            timeZone: orgTimeZone(org),
            profileLabel: label,
            date,
            book,
            special,
            rows: rows.map((r, i) => {
                const choice = loaded.rows[i]?.standing
                return {
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
            }),
            openItems: [],
            existing: loaded.existing,
            now,
        })
        return {
            ok: true,
            draftId: ref.id,
            expiresAt: expiresAt.toISOString(),
            profile: { key: profileKey, label, book },
            special,
            rows: rows.map(rowOut),
            openIndexes: openIndexesOf(rows),
            truncated: loaded.truncated,
            existing: loaded.existing,
            warnings: [
                ...loaded.existing.map((e): DraftWarning => ({ kind: "existing", index: null, text: `There is already a setlist on this date: ${e.name}` })),
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
