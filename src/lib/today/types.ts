/**
 * `today.json` — the one place the family states "what tonight is".
 *
 * A small, public, METADATA-ONLY document describing the current and upcoming
 * services, derived from the setlists CRC has authored. Two consumers read
 * it: the siddur reader (it replaces the reader's hardcoded `CAL`) and Overlays (the default
 * "Today's order" and the scan card's book). Both keep working when the file
 * is absent, so nothing here is load-bearing for a service.
 *
 * WHAT MAY NEVER APPEAR HERE. No liturgical text, no chart bytes, no chart
 * ids, no track list, no notes, no personal names beyond the leading rabbi's
 * already-public title. `__tests__/emit-today.test.ts` walks a built document
 * and fails on any of them, including any string carrying Hebrew. This is the
 * standing constraint, not a style preference: liturgical text never enters
 * .live, and chart bytes never leave it.
 *
 * NOT A LIVE POINTER. "What is happening right now" was declined
 * (RULINGS-INTEGRATION-2026-09-14, deferred 9 and 10). This is the plan, not
 * the state.
 *
 * The envelope shape is verbatim what the reader's `calFrom()` parses; it
 * returns null on anything else. Do not reshape it without the reader.
 */

export interface TodayService {
    setlistId: string
    /** The setlist's own name, e.g. "Shir Shabbat — September 18". */
    name: string
    /** The setlist's `templateType`, e.g. "friday_night". Omitted when unset. */
    serviceType?: string
    /** Calendar day of the service, America/Chicago, `YYYY-MM-DD`. */
    eventDate: string
    /**
     * Instant the service starts, ISO with `Z`. Derived from `eventDate` plus
     * the per-serviceType `defaultStartLocal` in the congregation config,
     * overridden by the setlist's own `startsAtLocal`. Omitted when neither
     * supplies a time — a date with no start time is honest; a guessed 00:00
     * is not.
     */
    startsAt?: string
    /** Book slug the service runs from (`list_books`). Omitted when unset. */
    book?: string
    /**
     * The same paper, named the way the READER shelves it (R2-e, 2026-09-15).
     *
     * Additive and advisory. `.live` registers the whole printed 2008 machzor
     * as one book; the reader splits it into per-service volumes because a
     * davener is davening from exactly one service. Neither naming is wrong,
     * and this field is the sentence between them — see
     * `src/lib/today/reader-book.ts`. The reader consults it only when `book`
     * is off its shelf, and never names a draft volume.
     */
    readerBook?: string
    /** First `liturgyRef.folio` in track order. Omitted when no row has one. */
    startFolio?: number
    /** The rabbi leading ("Led by"). Omitted when unset. */
    rabbi?: string
    stream?: {
        url: string
        /** Defaults to `stream.leadMinutes` (5) before `startsAt`. */
        startsAt?: string
    }
    /**
     * First-publish instant, ISO with `Z`. OPTIONAL since R2-f (2026-09-15):
     * CRC does not use publish, so most services never carry one. Emitted when
     * the setlist happens to have it; omitted otherwise. The reader's
     * `calFrom()` never read this field, so omission changes nothing there.
     */
    publishedAt?: string
    /** The setlist's `version` at emit time. */
    version: number
}

export interface TodayDoc {
    schemaVersion: 1
    /** Emit instant, ISO with `Z`. */
    generatedAt: string
    /** Setlists with `eventDate` today..+7d, soonest first; test rows excluded. */
    services: TodayService[]
}

/** Per-serviceType start times and the stream URL, from the congregation config. */
export interface CongregationServiceTimes {
    label: string
    /** `HH:mm`, America/Chicago wall clock. */
    defaultStartLocal: string
}

export interface CongregationStream {
    url: string
    /** Minutes before `startsAt` the stream goes live. Default 5. */
    leadMinutes?: number
}

/** Default lead time for `stream.startsAt` when the config does not say. */
export const DEFAULT_STREAM_LEAD_MINUTES = 5

/** How far ahead of today `services` reaches. */
export const TODAY_WINDOW_DAYS = 7

/** Storage path of the emitted document, per org. Never shared across tenants. */
export function todayStoragePath(orgId: string): string {
    return `public/today/${orgId}.json`
}

/**
 * Cache posture, identical on the Storage object and the serving route.
 * One minute fresh, ten minutes of stale-while-revalidate: a publish should
 * reach the reader within a minute, and a CDN hiccup should never leave the
 * band's surfaces staring at a 404 mid-service.
 */
export const TODAY_CACHE_CONTROL =
    "public, max-age=60, s-maxage=60, stale-while-revalidate=600"
