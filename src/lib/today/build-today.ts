import { wallClockToUtcMs } from "@/lib/parse-event-date"
import { dayInZone, orgTimeZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { readerBookFor } from "./reader-book"
import { familyWeekFields, isFamilyOrg, type StoredWeek } from "@/lib/family/week-key"
import {
    DEFAULT_STREAM_LEAD_MINUTES,
    TODAY_WINDOW_DAYS,
    type CongregationServiceTimes,
    type CongregationStream,
    type TodayDoc,
    type TodayService,
} from "./types"

/**
 * The PURE half of the `today.json` emitter.
 *
 * Kept apart from `emit-today.ts` (which reads Firestore and writes Storage) so
 * the forbidden-key guard and the windowing rules can be tested on real inputs
 * without an emulator. `emit-today.ts` fetches; this decides.
 */

/** One published setlist, already serialized (Timestamps → ISO strings). */
export interface TodaySetlistInput {
    id: string
    name?: unknown
    templateType?: unknown
    /** ISO string after serialization; may be absent or unparseable. */
    eventDate?: unknown
    /** Per-setlist override of the config's default start, `HH:mm` tenant wall clock. */
    startsAtLocal?: unknown
    book?: unknown
    rabbi?: unknown
    /** Test traffic (SEC-004 stamp). Never emitted. */
    isTest?: unknown
    version?: unknown
    /** First `liturgyRef.folio` in track order, resolved by the caller. */
    startFolio?: number | null
    /** BET-6: stored family week fields and the classification inputs for `occasion`. */
    weekKey?: unknown
    weekKeyDay?: unknown
    parashaName?: unknown
    occasion?: unknown
    ceremonyId?: unknown
    serviceType?: unknown
    rabbiSlot?: unknown
    special?: unknown
    /** BET-6: a week computed live by the caller when the stored one is missing or stale. */
    liveWeek?: StoredWeek | null
}

export interface BuildTodayInput {
    setlists: TodaySetlistInput[]
    services?: Record<string, CongregationServiceTimes> | null
    stream?: CongregationStream | null
    /** Emit instant. Injected so tests are not clock-dependent. */
    now: Date
    /**
     * Multi-tenant phase 1: the tenant whose zone the service days and start
     * times are in. Omitted → crc.
     */
    org?: OrgId
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function asString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

/** The `YYYY-MM-DD` calendar day an instant falls on in `timeZone` (default: CRC's). */
export function chicagoDateString(ms: number, timeZone: string = orgTimeZone(DEFAULT_ORG_ID)): string {
    return dayInZone(ms, timeZone)
}

/** Midnight at the start of `ms`'s calendar day in `timeZone`, as UTC ms. */
export function chicagoStartOfDayMs(ms: number, timeZone: string = orgTimeZone(DEFAULT_ORG_ID)): number {
    const [y, m, d] = chicagoDateString(ms, timeZone).split("-").map(Number)
    return wallClockToUtcMs(timeZone, y, m, d, 0, 0, 0, 0)
}

/**
 * The instant a service starts.
 *
 * `HH:mm` is a tenant WALL CLOCK time — 6pm is 6pm in November and in June —
 * so it goes through the same DST-aware conversion `parseEventDate` uses.
 * Returns null when no time is available: a date with no start time is honest,
 * a guessed midnight is not, and the reader omits what is absent.
 */
export function startsAtFor(
    eventDate: string,
    localTime: string | null,
    timeZone: string = orgTimeZone(DEFAULT_ORG_ID),
): string | null {
    if (!localTime || !HHMM_RE.test(localTime)) return null
    const [y, m, d] = eventDate.split("-").map(Number)
    const [hh, mm] = localTime.split(":").map(Number)
    if (!y || !m || !d) return null
    return new Date(wallClockToUtcMs(timeZone, y, m, d, hh, mm, 0, 0)).toISOString()
}

/**
 * Build the document from the setlists a tenant has authored.
 *
 * Selection: `isTest` not true, `eventDate` parseable, and that event day
 * inside [start of today in the tenant's zone, +7 days]. Soonest first.
 *
 * R2-f (Daniel, 2026-09-15): CRC DOES NOT USE PUBLISH. A setlist is live when
 * it exists. The original publish gate was written to keep a half-authored
 * service off the congregation's screens; in practice it kept EVERY service
 * off them, because nothing here is ever published — all five Yom Kippur 5787
 * setlists carry `publishedAt: null`, so `/today.json` answered 404 on the one
 * week it was built for. The date is the gate now. `isTest` is the only
 * exclusion, and it is the same one `/perform`'s public listing already uses.
 */
export function buildTodayDoc(input: BuildTodayInput): TodayDoc {
    const nowMs = input.now.getTime()
    const timeZone = orgTimeZone(input.org ?? DEFAULT_ORG_ID)
    const windowStart = chicagoStartOfDayMs(nowMs, timeZone)
    const windowEnd = windowStart + TODAY_WINDOW_DAYS * 24 * 60 * 60 * 1000

    const rows: Array<{ ms: number; service: TodayService }> = []

    for (const row of input.setlists) {
        if (row.isTest === true) continue

        const rawEvent = asString(row.eventDate)
        if (!rawEvent) continue
        const eventMs = Date.parse(rawEvent)
        if (Number.isNaN(eventMs)) continue

        // The service's CALENDAR DAY in the tenant's zone, then that day's midnight, so
        // a service already under way today (eventDate this morning) still
        // counts as today rather than falling out of the window.
        const eventDate = chicagoDateString(eventMs, timeZone)
        const eventDayMs = chicagoStartOfDayMs(eventMs, timeZone)
        if (eventDayMs < windowStart || eventDayMs > windowEnd) continue

        const serviceType = asString(row.templateType)
        const configured =
            serviceType && input.services ? input.services[serviceType] : undefined
        const localTime =
            asString(row.startsAtLocal) ?? asString(configured?.defaultStartLocal)
        const startsAt = startsAtFor(eventDate, localTime, timeZone)

        const service: TodayService = {
            setlistId: row.id,
            name: asString(row.name) ?? "",
            eventDate,
            version: typeof row.version === "number" ? row.version : 1,
        }
        if (serviceType) service.serviceType = serviceType
        if (startsAt) service.startsAt = startsAt
        const book = asString(row.book)
        if (book) service.book = book
        const readerBook = readerBookFor(book, serviceType)
        if (readerBook) service.readerBook = readerBook
        if (typeof row.startFolio === "number" && Number.isInteger(row.startFolio)) {
            service.startFolio = row.startFolio
        }
        const rabbi = asString(row.rabbi)
        if (rabbi) service.rabbi = rabbi
        // BET-6: additive family keys; nothing for any tenant but CRC.
        const org = input.org ?? DEFAULT_ORG_ID
        const family = familyWeekFields(row as unknown as Record<string, unknown>, org)
        const week = family.weekKey
            ? { weekKey: family.weekKey, parasha: family.parasha ?? null }
            : isFamilyOrg(org) ? row.liveWeek ?? null : null
        if (week) {
            service.weekKey = week.weekKey
            if (week.parasha) service.parasha = { slug: week.parasha.slug, name: week.parasha.name }
        }
        if (family.occasion) service.occasion = family.occasion

        const streamUrl = asString(input.stream?.url)
        if (streamUrl) {
            service.stream = { url: streamUrl }
            if (startsAt) {
                const lead =
                    typeof input.stream?.leadMinutes === "number" &&
                    input.stream.leadMinutes >= 0
                        ? input.stream.leadMinutes
                        : DEFAULT_STREAM_LEAD_MINUTES
                service.stream.startsAt = new Date(
                    Date.parse(startsAt) - lead * 60_000,
                ).toISOString()
            }
        }

        // Sort by the start instant when we have one, else the event day, so a
        // Friday evening service and a Saturday morning one order correctly
        // even though both days' midnights are what passed the window test.
        rows.push({ ms: startsAt ? Date.parse(startsAt) : eventMs, service })
    }

    rows.sort((a, b) => a.ms - b.ms)

    return {
        schemaVersion: 1,
        generatedAt: new Date(nowMs).toISOString(),
        services: rows.map((r) => r.service),
    }
}
