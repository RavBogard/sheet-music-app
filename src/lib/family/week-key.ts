import { classifyService } from "@/lib/history/classify"
import { getHebcalWeekItems, type HebcalWeekItem } from "@/lib/liturgical-calendar"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import type { OrgId } from "@/lib/org/types"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"

/**
 * BET-6 — the family "week spine" (TF-12, TF-16).
 *
 * A setlist carries an ADVISORY `weekKey` ("<hebrewYear>-<slug>", e.g.
 * `5787-bereshit`, or a holiday slug such as `5787-sukkot-1`) so the Haftarah
 * and Overlays sides can join on the same week without Daniel naming it three
 * times. It never drives behaviour here. Names only, never text.
 *
 * CRC only: the family (Haftarah, Overlays, the Beit Mitzvah portal) is CRC's.
 * Brothers Lazaroff gets no key, no parasha and no occasion.
 *
 * Stored beside the key: `weekKeyDay`, the tenant-local `YYYY-MM-DD` the key
 * was computed from, so a reader can tell a key that went stale after a
 * date edit made outside the server write path (the browser editor writes
 * through its own outbox). A stale key reads as absent; the back-fill tool
 * `backfill_week_keys` recomputes it.
 */

/** The only tenant with a family spine. */
export const FAMILY_ORG_ID: OrgId = "crc"

export function isFamilyOrg(org: OrgId | null | undefined): boolean {
    return org === FAMILY_ORG_ID
}

export interface WeekInfo {
    weekKey: string
    /** The tenant-local day the key was computed from. */
    day: string
    /** The weekly portion, or null on a holiday week with none. */
    parasha: { slug: string; name: string } | null
}

export const WEEK_KEY_RE = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8" }

/** "Sukkot VII (Hoshana Raba)" → "sukkot-7"; "Ha’azinu" → "haazinu"; "Rosh Hashana 5787" → "rosh-hashana". */
export function weekSlug(title: string): string {
    const words = title
        .replace(/^Parashat\s+/i, "")
        .replace(/\([^)]*\)/g, " ")
        .replace(/\s\d{4}\s*$/, " ")
        .replace(/['’‘`]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map((w) => ROMAN[w] ?? w)
    return words.join("-")
}

function hebrewYearOf(item: HebcalWeekItem): string | null {
    const m = item.hdate ? /(\d{4})\s*$/.exec(item.hdate) : null
    if (m) return m[1]
    const day = item.date.slice(0, 10)
    if (!DAY_RE.test(day)) return null
    const year = new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric", timeZone: "UTC" })
        .formatToParts(new Date(`${day}T12:00:00Z`))
        .find((p) => p.type === "year")?.value
    return year && /^\d{4}$/.test(year) ? year : null
}

/**
 * A festival day that names its own service: a major Hebcal holiday on a plain
 * date, not an Erev and not Chanukah (a Shabbat in Chanukah keeps its parasha).
 */
function isFestivalDay(item: HebcalWeekItem): boolean {
    return (
        item.category === "holiday" &&
        item.subcat === "major" &&
        DAY_RE.test(item.date) &&
        !/^Erev\b/i.test(item.title) &&
        !/^Chanukah\b/i.test(item.title)
    )
}

/**
 * PURE: the week of a service on `day` from Hebcal's Shabbat items for that
 * day. In order:
 *   1. the service day is itself a festival day → that holiday;
 *   2. the week has a parasha → the parasha;
 *   3. otherwise the first festival day from `day` on (a Friday evening that
 *      opens a festival Shabbat keys to the festival);
 *   4. nothing → null.
 * The Hebrew year is the chosen item's own, so the week across Rosh Hashanah
 * keys to the new year only once the new year's item is the one chosen.
 */
export function weekFromHebcal(day: string, items: readonly HebcalWeekItem[]): WeekInfo | null {
    if (!DAY_RE.test(day)) return null
    const build = (item: HebcalWeekItem, parasha: boolean): WeekInfo | null => {
        const year = hebrewYearOf(item)
        const slug = weekSlug(item.title)
        if (!year || !slug) return null
        const weekKey = `${year}-${slug}`
        if (!WEEK_KEY_RE.test(weekKey)) return null
        return {
            weekKey,
            day,
            parasha: parasha ? { slug, name: item.title.replace(/^Parashat\s+/i, "").trim() } : null,
        }
    }
    const today = items.find((i) => isFestivalDay(i) && i.date === day)
    if (today) return build(today, false)
    const parasha = items.find((i) => i.category === "parashat")
    if (parasha) return build(parasha, true)
    const next = items.find((i) => isFestivalDay(i) && i.date >= day)
    if (next) return build(next, false)
    return null
}

/** Millis of a stored or serialized `eventDate`: Timestamp, Date, ISO, ms or `{seconds}`. */
export function eventMs(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "string") {
        const t = Date.parse(v)
        return Number.isNaN(t) ? null : t
    }
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime()
    if (typeof v === "object") {
        const o = v as { toMillis?: () => number; seconds?: unknown; _seconds?: unknown }
        if (typeof o.toMillis === "function") return o.toMillis()
        const s = typeof o.seconds === "number" ? o.seconds : typeof o._seconds === "number" ? o._seconds : null
        if (s !== null) return s * 1000
    }
    return null
}

/** The tenant-local service day of an `eventDate`, or null. A bare `YYYY-MM-DD` is already a day. */
export function serviceDay(eventDate: unknown, org: OrgId): string | null {
    if (typeof eventDate === "string" && DAY_RE.test(eventDate)) return eventDate
    const ms = eventMs(eventDate)
    return ms === null ? null : dayInZone(ms, orgTimeZone(org))
}

/**
 * Compute the week for a service from Hebcal. Family tenant only; null for any
 * other tenant, an undated service, or Hebcal unreachable. Never throws.
 */
export async function computeWeek(eventDate: unknown, org: OrgId): Promise<WeekInfo | null> {
    if (!isFamilyOrg(org)) return null
    const day = serviceDay(eventDate, org)
    if (!day) return null
    try {
        const items = await getHebcalWeekItems(day, org)
        return items ? weekFromHebcal(day, items) : null
    } catch {
        return null
    }
}

/** The stored fields for a computed week. `parashaName` is null on a holiday week. */
export function weekFields(week: WeekInfo): { weekKey: string; weekKeyDay: string; parashaName: string | null } {
    return { weekKey: week.weekKey, weekKeyDay: week.day, parashaName: week.parasha?.name ?? null }
}

export interface StoredWeek {
    weekKey: string
    parasha: { slug: string; name: string } | null
}

/**
 * The week a setlist doc (raw or serialized) carries, when it is the family
 * tenant's and still matches the service day. A key computed for another day
 * (the date moved since) reads as absent: better none than a wrong week.
 */
export function storedWeek(data: Record<string, unknown> | null | undefined, org: OrgId): StoredWeek | null {
    if (!data || !isFamilyOrg(org)) return null
    const weekKey = data.weekKey
    if (typeof weekKey !== "string" || !WEEK_KEY_RE.test(weekKey)) return null
    const day = serviceDay(data.eventDate, org)
    if (!day || data.weekKeyDay !== day) return null
    const name = typeof data.parashaName === "string" && data.parashaName.trim() ? data.parashaName.trim() : null
    return { weekKey, parasha: name ? { slug: weekKey.slice(5), name } : null }
}

// ── Occasion (TF-16) ─────────────────────────────────────────────────

export const OCCASIONS = ["bnei-mitzvah", "holiday", "guest", "regular"] as const
export type Occasion = (typeof OCCASIONS)[number]

const HOLIDAY_TYPES = new Set(SERVICE_TYPE_CATALOG.filter((e) => e.category === "holiday").map((e) => e.key))

/**
 * The occasion of a family setlist: the stored value (set by the Beit Mitzvah
 * bridge) when valid, else inferred from the stricter `classifyService`. An
 * unclassifiable setlist has no occasion rather than a guessed one.
 */
export function occasionOf(data: Record<string, unknown> | null | undefined, org: OrgId): Occasion | undefined {
    if (!data || !isFamilyOrg(org)) return undefined
    if (typeof data.occasion === "string" && (OCCASIONS as readonly string[]).includes(data.occasion)) {
        return data.occasion as Occasion
    }
    if (typeof data.ceremonyId === "string" && data.ceremonyId) return "bnei-mitzvah"
    const cls = classifyService({
        name: typeof data.name === "string" ? data.name : "",
        templateType: typeof data.templateType === "string" ? data.templateType : null,
        rabbi: typeof data.rabbi === "string" ? data.rabbi : null,
        serviceType: typeof data.serviceType === "string" ? data.serviceType : null,
        rabbiSlot: typeof data.rabbiSlot === "string" ? data.rabbiSlot : null,
        special: typeof data.special === "boolean" ? data.special : null,
    })
    if (cls.serviceType === "bnei_mitzvah_saturday" || cls.serviceType === "havdalah_bnei_mitzvah") return "bnei-mitzvah"
    if (cls.serviceType && HOLIDAY_TYPES.has(cls.serviceType)) return "holiday"
    const name = typeof data.name === "string" ? data.name : ""
    if (/\b(with|w\/)\s/i.test(name)) return "guest"
    if (cls.serviceType && !cls.special) return "regular"
    return undefined
}

/** The family week fields a setlist reader adds (MCP and today.json). Empty for other tenants. */
export function familyWeekFields(row: Record<string, unknown>, org: OrgId): {
    weekKey?: string
    parasha?: { slug: string; name: string }
    occasion?: Occasion
} {
    const week = storedWeek(row, org)
    const occasion = occasionOf(row, org)
    return {
        ...(week ? { weekKey: week.weekKey } : {}),
        ...(week?.parasha ? { parasha: week.parasha } : {}),
        ...(occasion ? { occasion } : {}),
    }
}
