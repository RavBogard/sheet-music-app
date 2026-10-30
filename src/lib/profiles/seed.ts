import { validateLiturgyRef } from "@/lib/books/registry"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import { isSongType } from "@/lib/setlist-track-count"
import type { CoreProfile } from "./keys"
import { slotKeyFor } from "./keys"
import { buildSlotUses } from "./slot-uses"
import { computeSlotTier, USUAL_WINDOW, type Tier } from "./tiers"

/**
 * Setlist memory, release 2 — seed a profile from its own past setlists.
 * Pure.
 *
 * The running order is the most recent non-special setlist of the profile.
 * Non-song rows (headers, readings…) are copied. Each song row is tiered
 * over the profile's history: a `usual` row keeps its chart and key and is
 * marked `house`; every other row becomes an open slot with its title kept
 * as the label, and is listed in `unsure`. Nothing is filled by guess.
 */

export type SlotKind = "moment" | "song" | "open"

export interface HouseMark {
    source: "history"
    /** Regular weeks in the window that used this chart. */
    count: number
    /** Regular weeks in the window. */
    of: number
    seededAt: string
}

export interface SeededTrack {
    type: string
    title: string
    notes?: string
    momentId?: string
    /**
     * The base row's page, keyed by its book (template `liturgyRefs` shape),
     * so a setlist made from the profile is bound to the profile's book the
     * way clone_setlist_from_template binds it; a row with no page for that
     * book is reported as unresolved, never given another book's page.
     */
    liturgyRefs?: Record<string, { unitId?: string; folio: number }>
    fileId?: string
    fileName?: string
    key?: string
    slotKind?: SlotKind
    slotKey?: string
    house?: HouseMark | null
}

export interface SeedUnsure {
    label: string
    /** The slot's tier: last_time, other_service or new. */
    reason: Tier
    phrase: string
}

export interface SeedResult {
    tracks: SeededTrack[]
    unsure: SeedUnsure[]
    basedOn: { setlistId: string; eventDate: string } | null
}

export function seedProfile(
    def: Pick<CoreProfile, "serviceType" | "rabbiSlot">,
    setlists: HistorySetlist[],
    library: Map<string, LibraryLite>,
    now: Date = new Date(),
): SeedResult {
    const index = buildSlotUses(setlists, library, { serviceType: def.serviceType, rabbiSlot: def.rabbiSlot })
    const base = index.profileSetlists.find((s) => !s.special)
    if (!base) return { tracks: [], unsure: [], basedOn: null }

    const seededAt = now.toISOString()
    const tracks: SeededTrack[] = []
    const unsure: SeedUnsure[] = []

    for (const t of base.tracks) {
        const title = t.title ?? ""
        const refs = pageOf(t)
        if (!isSongType(t.type)) {
            const row: SeededTrack = { type: t.type, title }
            if (t.notes) row.notes = t.notes
            if (t.momentId) row.momentId = t.momentId
            if (refs) row.liturgyRefs = refs
            tracks.push(row)
            continue
        }
        const slotKey = slotKeyFor(t, index.partGroupOf)
        const profileUses = index.profileUses(slotKey)
        const tier = computeSlotTier({ standing: null, profileUses, otherUses: index.otherUses(slotKey) })
        if (tier.tier === "usual" && tier.fileId) {
            const window = profileUses.filter((u) => !u.special).slice(0, USUAL_WINDOW)
            const group = window.find((u) => u.fileId === tier.fileId)?.partGroup
            const row: SeededTrack = {
                type: "song",
                title,
                fileId: tier.fileId,
                slotKind: slotKey.startsWith("moment:") ? "moment" : "song",
                slotKey,
                house: {
                    source: "history",
                    count: window.filter((u) => u.partGroup === group).length,
                    of: window.length,
                    seededAt,
                },
            }
            if (t.momentId) row.momentId = t.momentId
            if (refs) row.liturgyRefs = refs
            if (t.fileId === tier.fileId && t.fileName) row.fileName = t.fileName
            if (tier.key) row.key = tier.key
            tracks.push(row)
            continue
        }
        const row: SeededTrack = { type: "song", title, slotKind: "open", slotKey, house: null }
        if (t.momentId) row.momentId = t.momentId
        if (refs) row.liturgyRefs = refs
        tracks.push(row)
        unsure.push({ label: title, reason: tier.tier, phrase: tier.phrase })
    }

    return { tracks, unsure, basedOn: { setlistId: base.id, eventDate: base.eventDate! } }
}

/** A row's valid, current page as per-book refs; null when it has none. */
function pageOf(t: HistorySetlist["tracks"][number]): SeededTrack["liturgyRefs"] | null {
    const ref = t.liturgyRef
    if (!ref || ref.stale) return null
    if (!validateLiturgyRef({ book: ref.book, folio: ref.folio, ...(ref.unitId ? { unitId: ref.unitId } : {}) }).ok) return null
    return { [ref.book]: ref.unitId ? { unitId: ref.unitId, folio: ref.folio } : { folio: ref.folio } }
}
