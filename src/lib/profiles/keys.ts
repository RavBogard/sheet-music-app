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
    { key: "bnei_mitzvah_saturday", label: "B'nei Mitzvah", serviceType: "bnei_mitzvah_saturday", rabbiSlot: null, book: "legacy-beit-mitzvah" },
    { key: "havdalah_bnei_mitzvah", label: "Havdalah B'nei Mitzvah", serviceType: "havdalah_bnei_mitzvah", rabbiSlot: null, book: "legacy-beit-mitzvah" },
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
}

/**
 * The slot a row fills: `moment:<momentId>` when the row names a moment — a
 * stored momentId, else the moment its title names on a single clear match
 * (bind-on-type's matcher; see moment-key.ts) — so every setting of one
 * prayer is one slot. Otherwise `song:<partGroup>` (every instrument copy of one
 * arrangement shares it), falling back to the title's stem when the chart has
 * none.
 */
export function slotKeyFor(
    track: SlotTrack,
    partGroupOf: (fileId: string) => string | null,
    opts: SlotKeyOptions = {},
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
