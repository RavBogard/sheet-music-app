import type { RabbiSlotKey } from "@/lib/history/classify"
import { historyStem } from "@/lib/history/song-history"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"

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

/**
 * The slot a row fills: `moment:<momentId>` when the row names a moment,
 * otherwise `song:<partGroup>` (every instrument copy of one arrangement
 * shares it), falling back to the title's stem when the chart has none.
 */
export function slotKeyFor(
    track: { momentId?: string | null; title: string; fileId?: string | null },
    partGroupOf: (fileId: string) => string | null,
): string {
    if (typeof track.momentId === "string" && track.momentId) return `moment:${track.momentId}`
    const partGroup = track.fileId ? partGroupOf(track.fileId) : null
    return `song:${partGroup ?? historyStem(track.title ?? "")}`
}
