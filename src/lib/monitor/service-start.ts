import { startsAtFor } from "@/lib/today/build-today"
import { orgTimeZone } from "@/lib/org/locale"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"

/**
 * When a CRC service starts, for the two jobs that run around the studio PC's
 * on/off schedule (the pre-service bridge alert and the end-of-service mix
 * snapshot). Both read the same `today.json` services the band's surfaces read.
 *
 * Pure: no Firestore, no clock. Times are the tenant's wall clock, converted
 * with the same DST-aware helper `today.json` itself uses, so 6:15 pm is 6:15 pm
 * in November and in June even though Vercel crons are UTC-only.
 */

/** The slice of a `today.json` service these jobs need. */
export interface ServiceLike {
    setlistId: string
    name?: string
    serviceType?: string
    /** Tenant calendar day, `YYYY-MM-DD`. */
    eventDate?: string
    /** ISO instant; absent when neither the setlist nor the config gave a time. */
    startsAt?: string
}

/**
 * Fallback start, `HH:mm` local, by weekday (0 = Sunday), for a service whose
 * setlist and config carry no time. Friday evening and Shabbat morning only; any
 * other day with no time is unknown and is left alone rather than guessed.
 */
export const DEFAULT_START_LOCAL_BY_WEEKDAY: Record<number, string> = {
    5: "18:15",
    6: "10:00",
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** The instant (UTC ms) the service starts, or null when it cannot be known. */
export function resolveServiceStartMs(
    s: Pick<ServiceLike, "startsAt" | "eventDate">,
    timeZone: string = orgTimeZone(DEFAULT_ORG_ID),
): number | null {
    if (typeof s.startsAt === "string") {
        const ms = Date.parse(s.startsAt)
        if (Number.isFinite(ms)) return ms
    }
    const m = typeof s.eventDate === "string" ? DAY_RE.exec(s.eventDate) : null
    if (!m) return null
    const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
    const local = DEFAULT_START_LOCAL_BY_WEEKDAY[weekday]
    if (!local) return null
    const iso = startsAtFor(s.eventDate as string, local, timeZone)
    return iso ? Date.parse(iso) : null
}

/** A service together with its resolved start, keyed by service and start. */
export interface TimedService extends ServiceLike {
    startMs: number
    /** Stable per-service identity: the same service keeps it across cron runs. */
    key: string
}

export function timedServices(
    services: ServiceLike[],
    timeZone: string = orgTimeZone(DEFAULT_ORG_ID),
): TimedService[] {
    const out: TimedService[] = []
    for (const s of services ?? []) {
        if (!s || typeof s.setlistId !== "string" || !s.setlistId) continue
        const startMs = resolveServiceStartMs(s, timeZone)
        if (startMs == null) continue
        out.push({ ...s, startMs, key: `${s.setlistId}@${startMs}` })
    }
    return out.sort((a, b) => a.startMs - b.startMs)
}

/** `6:15 PM`, in the tenant's zone. */
export function formatLocalTime(ms: number, timeZone: string = orgTimeZone(DEFAULT_ORG_ID)): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(ms))
}
