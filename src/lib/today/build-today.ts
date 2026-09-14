import { chicagoWallClockToUtcMs } from "@/lib/parse-event-date"
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
    /** Per-setlist override of the config's default start, `HH:mm` Chicago. */
    startsAtLocal?: unknown
    book?: unknown
    rabbi?: unknown
    publishedAt?: unknown
    version?: unknown
    /** First `liturgyRef.folio` in track order, resolved by the caller. */
    startFolio?: number | null
}

export interface BuildTodayInput {
    setlists: TodaySetlistInput[]
    services?: Record<string, CongregationServiceTimes> | null
    stream?: CongregationStream | null
    /** Emit instant. Injected so tests are not clock-dependent. */
    now: Date
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function asString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null
}

/** The `YYYY-MM-DD` calendar day an instant falls on in America/Chicago. */
export function chicagoDateString(ms: number): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(ms))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}

/** Midnight at the start of `ms`'s Chicago calendar day, as UTC ms. */
export function chicagoStartOfDayMs(ms: number): number {
    const [y, m, d] = chicagoDateString(ms).split("-").map(Number)
    return chicagoWallClockToUtcMs(y, m, d, 0, 0, 0, 0)
}

/**
 * The instant a service starts.
 *
 * `HH:mm` is a Chicago WALL CLOCK time — 6pm is 6pm in November and in June —
 * so it goes through the same DST-aware conversion `parseEventDate` uses.
 * Returns null when no time is available: a date with no start time is honest,
 * a guessed midnight is not, and the reader omits what is absent.
 */
export function startsAtFor(
    eventDate: string,
    localTime: string | null,
): string | null {
    if (!localTime || !HHMM_RE.test(localTime)) return null
    const [y, m, d] = eventDate.split("-").map(Number)
    const [hh, mm] = localTime.split(":").map(Number)
    if (!y || !m || !d) return null
    return new Date(chicagoWallClockToUtcMs(y, m, d, hh, mm, 0, 0)).toISOString()
}

/**
 * Build the document from published setlists.
 *
 * Selection: `publishedAt` present, `eventDate` parseable, and that event day
 * inside [start of today Chicago, +7 days]. Soonest first. Unpublished
 * setlists are never read — that is the ruling, and it is also what keeps a
 * half-authored service off the congregation's screens.
 */
export function buildTodayDoc(input: BuildTodayInput): TodayDoc {
    const nowMs = input.now.getTime()
    const windowStart = chicagoStartOfDayMs(nowMs)
    const windowEnd = windowStart + TODAY_WINDOW_DAYS * 24 * 60 * 60 * 1000

    const rows: Array<{ ms: number; service: TodayService }> = []

    for (const row of input.setlists) {
        const publishedAt = asString(row.publishedAt)
        if (!publishedAt) continue

        const rawEvent = asString(row.eventDate)
        if (!rawEvent) continue
        const eventMs = Date.parse(rawEvent)
        if (Number.isNaN(eventMs)) continue

        // The service's CALENDAR DAY in Chicago, then that day's midnight, so
        // a service already under way today (eventDate this morning) still
        // counts as today rather than falling out of the window.
        const eventDate = chicagoDateString(eventMs)
        const eventDayMs = chicagoStartOfDayMs(eventMs)
        if (eventDayMs < windowStart || eventDayMs > windowEnd) continue

        const serviceType = asString(row.templateType)
        const configured =
            serviceType && input.services ? input.services[serviceType] : undefined
        const localTime =
            asString(row.startsAtLocal) ?? asString(configured?.defaultStartLocal)
        const startsAt = startsAtFor(eventDate, localTime)

        const service: TodayService = {
            setlistId: row.id,
            name: asString(row.name) ?? "",
            eventDate,
            publishedAt,
            version: typeof row.version === "number" ? row.version : 1,
        }
        if (serviceType) service.serviceType = serviceType
        if (startsAt) service.startsAt = startsAt
        const book = asString(row.book)
        if (book) service.book = book
        if (typeof row.startFolio === "number" && Number.isInteger(row.startFolio)) {
            service.startFolio = row.startFolio
        }
        const rabbi = asString(row.rabbi)
        if (rabbi) service.rabbi = rabbi

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
