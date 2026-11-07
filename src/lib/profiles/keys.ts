import type { RabbiSlotKey } from "@/lib/history/classify"
import { historyStem } from "@/lib/history/song-history"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { momentForTitle } from "./moment-key"
import type { OrgId } from "@/lib/org/types"

/**
 * Setlist memory, release 2 — profile keys and slot keys. Pure: no Firestore.
 *
 * A profile is one recurring service (a service type, split by rabbi slot
 * where the rabbi changes the music). A slot is one place in that service:
 * a liturgical moment, or a song when the row has no moment.
 */

export interface CoreProfile {
    key: string
    label: string
    serviceType: string
    rabbiSlot: RabbiSlotKey | null
    book: string | null
}

/** The scope a non-CRC tenant's setlist with no stored service type remembers under. */
export const BARE_GIG_SCOPE = "gig"

/**
 * The service type a setlist's memory lives under. CRC classifies every
 * service it profiles; another tenant's setlists are not services from the
 * CRC catalog (BrosLaz plays gigs), so its choices live under its stored
 * service type, else `gig`. One function, so remembering a choice and
 * recognising it later can never look in two different places.
 */
export function memoryServiceType(
    org: OrgId,
    classified: string | null,
    stored: string | null,
): string | null {
    return classified ?? (org !== DEFAULT_ORG_ID ? (stored ?? BARE_GIG_SCOPE) : null)
}

export function profileKeyFor(serviceType: string, rabbiSlot: string | null): string {
    return rabbiSlot ? `${serviceType}:${rabbiSlot}` : serviceType
}

export const CRC_CORE_PROFILES: readonly CoreProfile[] = [
    { key: "friday_night:daniel_karen", label: "Daniel Friday night", serviceType: "friday_night", rabbiSlot: "daniel_karen", book: "crc-friday" },
    { key: "friday_night:randy", label: "Randy Friday night", serviceType: "friday_night", rabbiSlot: "randy", book: "crc-friday" },
    { key: "shabbat_morning:daniel_karen", label: "Daniel Shabbat morning", serviceType: "shabbat_morning", rabbiSlot: "daniel_karen", book: "crc-saturday" },
    { key: "shabbat_morning:randy", label: "Randy Shabbat morning", serviceType: "shabbat_morning", rabbiSlot: "randy", book: "crc-saturday" },
    { key: "shir_shabbat", label: "Shir Shabbat", serviceType: "shir_shabbat", rabbiSlot: null, book: "legacy-shabbat-evening" },
    { key: "shir_keter", label: "Shir Keter", serviceType: "shir_keter", rabbiSlot: null, book: "crc-friday" },
    { key: "bnei_mitzvah_saturday", label: "B'nei Mitzvah", serviceType: "bnei_mitzvah_saturday", rabbiSlot: null, book: "legacy-beit-mitzvah" },
    { key: "havdalah_bnei_mitzvah", label: "Havdalah B'nei Mitzvah", serviceType: "havdalah_bnei_mitzvah", rabbiSlot: null, book: "legacy-beit-mitzvah" },
    { key: "adult_bnei_mitzvah", label: "Adult B'nei Mitzvah", serviceType: "adult_bnei_mitzvah", rabbiSlot: null, book: "legacy-beit-mitzvah" },
]

const RABBI_REQUIRED = new Set(["friday_night", "shabbat_morning"])

/** True when a profile of this service type cannot be chosen without a rabbi slot. */
export function rabbiRequired(serviceType: string): boolean {
    return RABBI_REQUIRED.has(serviceType)
}

const CATALOG_LABEL = new Map(SERVICE_TYPE_CATALOG.map((e) => [e.key, e.label]))

/**
 * The SERVICE_TYPE_CATALOG label of a service type — what `SlotUse.serviceLabel`
 * carries. An unknown type returns itself; null returns null.
 */
export function serviceLabelFor(serviceType: string | null): string | null {
    if (!serviceType) return null
    return CATALOG_LABEL.get(serviceType) ?? serviceType
}

/** A row as slot keys read it. A page never names the slot: only a stored moment or a clear title. */
export interface SlotTrack {
    momentId?: string | null
    title: string
    fileId?: string | null
    type?: string | null
}

export interface SlotKeyOptions {
    /**
     * Look the moment up from the title and the page when the row stores none
     * (MCP-02). Default true. Brothers Lazaroff keeps its song slots, so its
     * gig memory never changes key.
     */
    byTitle?: boolean
    /**
     * The one moment a chart (its partGroup, else its fileId) has been played
     * at across the history, or null (`chartMomentsOf` in slot-uses.ts). Lets
     * a row whose title names no moment ("Oseh shalom - Nava tehila") share
     * the slot of the rows that do, so a standard and a learned slot line up.
     * Used only with `byTitle`.
     */
    momentOfChart?: (chart: string) => string | null
}

/** A chart's identity for memory: its partGroup (every instrument copy shares it), else its fileId. */
export function chartOf(fileId: string, partGroupOf: (fileId: string) => string | null): string {
    return partGroupOf(fileId) ?? fileId
}

/**
 * The last-resort slot of a row with no moment and no chart: its title with
 * case, punctuation, whitespace, clarifiers and a file extension removed, so
 * "Ma tovu / Hinei ma tov ", "Ma Tovu > Hinei Ma Tov" and
 * "Ma tovu_Hinei ma tov - trad" are one song.
 */
export function titleSlotStem(title: string): string {
    return historyStem(title ?? "")
        .replace(/['‘’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

/**
 * The slot a row fills (Daniel 2026-11-07: by prayer moment first, then by
 * chart, never by row title):
 * 1. `moment:<id>` — the row's stored moment; else the moment its title names
 *    on a single clear match (moment-key.ts); else the one moment its chart
 *    has been played at (`momentOfChart`);
 * 2. `song:<chart>` — the chart's partGroup, else its fileId;
 * 3. `song:<title stem>` — only for a row with no chart.
 */
export function slotKeyFor(
    track: SlotTrack,
    partGroupOf: (fileId: string) => string | null,
    opts: SlotKeyOptions = {},
): string {
    if (typeof track.momentId === "string" && track.momentId) return `moment:${track.momentId}`
    const byTitle = opts.byTitle !== false
    if (byTitle) {
        const moment = momentForTitle(track.title, track.type ?? "song")
        if (moment) return `moment:${moment}`
    }
    if (track.fileId) {
        const chart = chartOf(track.fileId, partGroupOf)
        const moment = byTitle && opts.momentOfChart ? opts.momentOfChart(chart) : null
        if (moment) return `moment:${moment}`
        return `song:${chart}`
    }
    return `song:${titleSlotStem(track.title ?? "") || (track.title ?? "").trim().toLowerCase()}`
}

/**
 * Every older key a standing choice for this row may be stored under: the
 * key before MCP-02, the key before charts and history were consulted, and
 * the chart's own song key. Reads fall back to these when the slot's own key
 * holds no choice.
 */
export function slotKeyAliases(
    track: SlotTrack,
    partGroupOf: (fileId: string) => string | null,
    slotKey: string,
    opts: SlotKeyOptions = {},
): string[] {
    const out = new Set<string>([legacySlotKeyFor(track, partGroupOf), previousSlotKeyFor(track, partGroupOf, opts)])
    if (track.fileId) out.add(`song:${chartOf(track.fileId, partGroupOf)}`)
    out.delete(slotKey)
    return [...out]
}

/** The key before 2026-11-07: a stored or title moment, else partGroup, else the title's stem. */
function previousSlotKeyFor(
    track: SlotTrack,
    partGroupOf: (fileId: string) => string | null,
    opts: SlotKeyOptions,
): string {
    if (typeof track.momentId === "string" && track.momentId) return `moment:${track.momentId}`
    if (opts.byTitle !== false) {
        const moment = momentForTitle(track.title, track.type ?? "song")
        if (moment) return `moment:${moment}`
    }
    return legacySlotKeyFor(track, partGroupOf)
}

/**
 * The slot key before MCP-02 (moment only when stored). Standing choices made
 * then are stored under it, so reads look there when the new key has none.
 */
export function legacySlotKeyFor(track: SlotTrack, partGroupOf: (fileId: string) => string | null): string {
    if (typeof track.momentId === "string" && track.momentId) return `moment:${track.momentId}`
    const partGroup = track.fileId ? partGroupOf(track.fileId) : null
    return `song:${partGroup ?? historyStem(track.title ?? "")}`
}
