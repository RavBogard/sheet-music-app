import "server-only"

import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { loadLibraryLite } from "@/lib/history/load"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { isSongType } from "@/lib/setlist-track-count"
import { getBook } from "@/lib/books/registry"
import { legacySlotKeyFor, profileKeyFor, rabbiRequired, slotKeyFor } from "@/lib/profiles/keys"
import { buildReadback, settingOf, type Readback, type ReadbackRow } from "@/lib/profiles/readback"
import { buildSlotUses, historyAliases, loadSlotUses } from "@/lib/profiles/slot-uses"
import { readStandingFor } from "@/lib/profiles/standing"
import { computeSlotTier, phrase as tierPhrase, type SlotTier } from "@/lib/profiles/tiers"
import { vsLastOf, type VsLast } from "@/lib/profiles/vs-last"
import type { TemplateProfile } from "./templates"
import { readOpenItems } from "./open-items"
import { hidesLiturgicalFields } from "@/lib/org/vocab"
import { readGig } from "@/lib/gig/model"
import { anyDuration, setTotals, type SetTotal } from "@/lib/gig/set-totals"
import { findProfileTemplateFor } from "./service-profiles"

/**
 * Setlist memory, release 3 — `read_back_setlist`: an existing setlist said
 * aloud the way draft_service says a draft, exceptions first.
 *
 * When the setlist stores its service type (and its rabbi slot, where the
 * rabbi changes the music) and that profile exists, each song row is tiered
 * against the profile's history and standing choices, with this setlist's
 * own uses left out so a row never counts itself. A row whose chart or key
 * differs from its standard or usual is listed. Otherwise (old data,
 * Brothers Lazaroff) there are no tiers: only rows with no chart and open
 * items are listed. Read-only; tenant-scoped.
 */

export interface ReadBackSetlistArgs {
    setlistId: string
}

export interface ReadBackSetlistResult {
    ok: true
    setlistId: string
    readback: Readback
    /** MCP-05: per slot, what the profile's last regular service before this one had. Recall only. */
    vsLast: VsLast | null
    /** BET-5: each set's running length; for band tenants, and for any setlist with a timed row. */
    setTotals?: SetTotal[]
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * The event day as YYYY-MM-DD in the tenant's zone: eventDate is local wall
 * time, so an evening service stored as 00:30Z the next day is still its own
 * day. A bare YYYY-MM-DD string is already a day.
 */
function eventDay(v: unknown, org: OrgId): string | null {
    let ms: number
    if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
        ms = (v as { toMillis: () => number }).toMillis()
    } else if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
        ms = Date.parse(v)
    } else {
        return null
    }
    return Number.isNaN(ms) ? null : dayInZone(ms, orgTimeZone(org))
}

function inKey(key: string | null | undefined): string {
    return key ? ` in ${key}` : ""
}

interface Row {
    id: string
    type: string
    title: string
    fileId: string | null
    fileName: string | null
    key: string | null
    momentId: string | null
}

function notFound(setlistId: string): RichErrorEnvelope {
    return richError("setlist_not_found", `Setlist '${setlistId}' was not found.`, { setlistId }, "Verify the id via list_setlists.")
}

export async function readBackSetlistTool(
    _uid: string,
    args: ReadBackSetlistArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ReadBackSetlistResult | RichErrorEnvelope> {
    const setlistId = str(args?.setlistId)
    if (!setlistId) {
        return richError("invalid_argument", "Pass `setlistId`.", { fields: ["setlistId"] }, "Get it from list_setlists.")
    }
    try {
        initAdmin()
        const db = getFirestore()
        const snap = await db.collection("setlists").doc(setlistId).get()
        const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
        // Another tenant's setlist answers exactly as a missing one.
        if (!data || rowOrg(data.orgId) !== org) return notFound(setlistId)

        const rawTracks = (await getTracksForSetlist(db, setlistId, data)) as unknown as Array<Record<string, unknown>>
        const ordered = rawTracks
            .filter((t) => typeof t.orgId !== "string" || !t.orgId || rowOrg(t.orgId) === org)
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        const totalsRows = ordered.map((t) => ({
            id: String(t.id),
            type: str(t.type) ?? "song",
            title: typeof t.title === "string" ? t.title : "",
            durationSec: t.durationSec,
        }))
        const totals =
            hidesLiturgicalFields(org) || anyDuration(totalsRows) ? setTotals(totalsRows, readGig(data.gig)) : undefined
        const rows: Row[] = ordered
            .map((t) => ({
                id: String(t.id),
                type: str(t.type) ?? "song",
                title: typeof t.title === "string" ? t.title : "",
                fileId: str(t.fileId),
                fileName: str(t.fileName),
                key: str(t.key),
                momentId: str(t.momentId),
            }))

        const serviceType = str(data.serviceType)
        const storedRabbi = str(data.rabbiSlot)
        const rabbiSlot = serviceType && rabbiRequired(serviceType) ? storedRabbi : null
        const tagged = !!serviceType && (!rabbiRequired(serviceType) || !!storedRabbi)
        const profileKey = tagged ? profileKeyFor(serviceType!, rabbiSlot) : null
        const profileDoc = profileKey ? await findProfileTemplateFor(org, profileKey) : null

        let profileLabel: string | null = null
        let readbackRows: ReadbackRow[]
        let vsLast: VsLast | null = null
        const notices: Array<{ kind: "book_differs"; text: string }> = []
        const day = eventDay(data.eventDate, org)
        if (profileDoc && profileKey && serviceType) {
            const profile = profileDoc.data().profile as TemplateProfile | undefined
            profileLabel = str(profile?.label) ?? null
            const tiered = await tieredRows(org, setlistId, serviceType, rabbiSlot, profileKey, rows, day)
            readbackRows = tiered.rows
            vsLast = tiered.vsLast
            // MCP-21: say when this setlist prays from another book than its profile.
            const own = str(data.book)
            const profileBook = str(profile?.book)
            if (own && profileBook && own !== profileBook) {
                notices.push({
                    kind: "book_differs",
                    text: `Book differs from profile: this setlist uses ${getBook(own)?.title ?? own}; the profile uses ${getBook(profileBook)?.title ?? profileBook}`,
                })
            }
        } else {
            readbackRows = rows.map((r, index) => ({
                index,
                label: r.title,
                isSong: isSongType(r.type),
                hasChart: !!r.fileId,
                tier: null,
                phrase: null,
                keyOnRecord: r.key !== null,
            }))
        }

        const readback = buildReadback({
            timeZone: orgTimeZone(org),
            profileLabel,
            title: profileLabel ? null : str(data.name),
            date: day,
            notices,
            book: str(data.book),
            special: data.special === true,
            rows: readbackRows,
            openItems: readOpenItems(data),
            now: new Date(),
        })
        return { ok: true, setlistId, readback, vsLast, ...(totals ? { setTotals: totals } : {}) }
    } catch (error) {
        logger.warn("read_back_setlist failed:", error)
        return richError(
            "internal_error",
            "Could not read the setlist back.",
            { errorCode: 500 },
            "Retry; get_setlist still shows the rows.",
        )
    }
}

/** Tier each song row by its slot, from history without this setlist and from standing choices. */
async function tieredRows(
    org: OrgId,
    setlistId: string,
    serviceType: string,
    rabbiSlot: string | null,
    profileKey: string,
    rows: Row[],
    day: string | null,
): Promise<{ rows: ReadbackRow[]; vsLast: VsLast | null }> {
    // Brothers Lazaroff keeps song slots: no title lookup outside CRC.
    const byTitle = org === DEFAULT_ORG_ID
    const filter = { serviceType, rabbiSlot, byTitle }
    const loaded = await loadSlotUses(org, filter)
    const own = loaded.setlists.find((s) => s.id === setlistId)
    const library = new Map(loaded.library)
    const missing = rows.map((r) => r.fileId).filter((f): f is string => !!f && !library.has(f))
    if (missing.length > 0) for (const [k, v] of await loadLibraryLite(org, missing)) library.set(k, v)
    // This setlist's own uses never count toward its tiers.
    const index = buildSlotUses(
        loaded.setlists.filter((s) => s.id !== setlistId),
        library,
        filter,
    )
    const partGroupOf = (fileId: string) => library.get(fileId)?.partGroup ?? null
    // The loader derives a row's moment from its page when momentId is not stored.
    const ownMoment = new Map((own?.tracks ?? []).map((t) => [t.id, t.momentId]))

    const slots = rows.map((r) => {
        if (!isSongType(r.type)) return null
        const t = { momentId: r.momentId ?? ownMoment.get(r.id) ?? null, title: r.title, fileId: r.fileId }
        const slotKey = slotKeyFor(t, partGroupOf, { byTitle })
        const legacy = legacySlotKeyFor(t, partGroupOf)
        const aliases = [...new Set([legacy, ...historyAliases(index, slotKey)])].filter((a) => a !== slotKey)
        return { slotKey, aliases }
    })
    const slotKeys = slots.map((x) => x?.slotKey ?? null)
    const standing = await readStandingFor(org, profileKey, slots.filter((x): x is { slotKey: string; aliases: string[] } => !!x))
    const zone = orgTimeZone(org)
    const dayOf = (iso: string) => {
        const t = Date.parse(iso)
        return Number.isNaN(t) ? iso.slice(0, 10) : dayInZone(t, zone)
    }
    const vsLast = vsLastOf(index.profileSetlists, library, { before: day, excludeId: setlistId, dayOf, byTitle })

    const out = rows.map((r, i) => {
        const slotKey = slotKeys[i]
        const base: ReadbackRow = {
            index: i,
            label: r.title,
            isSong: isSongType(r.type),
            hasChart: !!r.fileId,
            tier: null,
            phrase: null,
            keyOnRecord: r.key !== null,
        }
        if (!slotKey) return base
        const choice = standing.get(slotKey) ?? null
        const tier = computeSlotTier({
            standing: choice,
            profileUses: index.profileUses(slotKey),
            otherUses: index.otherUses(slotKey),
        })
        const chartName = r.fileId ? (library.get(r.fileId)?.name ?? r.fileName ?? r.title) : null
        const row: ReadbackRow = { ...base, tier: tier.tier, phrase: tier.phrase }
        if (!r.fileId && tier.fileId && !tier.dead && (tier.tier === "last_time" || tier.tier === "other_service")) {
            row.recall = {
                setting: settingOf(tier.chartName, tier.setting),
                key: tier.key ?? null,
                date: tier.lastDate ? dayOf(tier.lastDate) : null,
                serviceLabel: otherLabel(index, slotKey),
            }
        }
        if (choice) row.standing = { byName: choice.byName, at: choice.at }
        if (tier.promotion) row.promotion = tier.promotion
        if (r.fileId && (tier.tier === "standard" || tier.tier === "usual")) {
            const differs = differsFrom(tier, r, partGroupOf)
            if (differs) {
                row.differs = tier.chartName
                    ? `${chartName}${inKey(r.key)} this week; usual is ${tier.chartName}${inKey(tier.key)}`
                    : `${chartName}${inKey(r.key)} this week, not the usual chart${tier.key ? ` (usually${inKey(tier.key)})` : ""}`
            }
        } else if (r.fileId) {
            // The slot is not usual here, but the row has a chart: say what it is.
            row.phrase = `${chartName}${inKey(r.key)} this week; ${
                tier.tier === "new" ? "new here" : tierPhrase(tier.tier, tier.chartName, tier.key, otherLabel(index, slotKey))
            }`
        }
        return row
    })
    return { rows: out, vsLast }
}

function otherLabel(index: ReturnType<typeof buildSlotUses>, slotKey: string): string | null {
    return index.otherUses(slotKey)[0]?.serviceLabel ?? null
}

/** True when the row's chart (by part group) or key differs from its standard or usual. */
function differsFrom(tier: SlotTier, r: Row, partGroupOf: (f: string) => string | null): boolean {
    if (!r.fileId || !tier.fileId) return false
    const rowGroup = partGroupOf(r.fileId) ?? r.fileId
    const tierGroup = partGroupOf(tier.fileId) ?? tier.fileId
    if (rowGroup !== tierGroup) return true
    // A key not on record on either side is not a difference.
    return !!tier.key && !!r.key && tier.key !== r.key
}
