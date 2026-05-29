import { Timestamp } from "firebase-admin/firestore"

/**
 * Convert an eventDate input (Date or string) into a Firestore Timestamp
 * using **America/Chicago wall-clock** semantics for naive inputs.
 *
 * Why this exists: setlist `eventDate` is a wall-clock-local concept
 * (cycle-12 FU-c12-2). The previous `new Date(value)` fallthrough fell
 * into two traps on Vercel serverless (process TZ = UTC):
 *
 *   1. **Naive datetime trap (ECMAScript spec):** `new Date("2026-05-30T10:00")`
 *      is parsed as the process's local timezone. On Vercel that's UTC —
 *      so "10am Chicago intent" became 10am UTC = 5am Chicago = wrong.
 *
 *   2. **Explicit-Z agent trap:** Claude Desktop / authoring agents routinely
 *      construct `"2026-05-30T10:00:00.000Z"` thinking the trailing Z is
 *      "the ISO format" — when it actually pins the instant to UTC zero,
 *      again producing 5am Chicago.
 *
 * Both traps land in storage as `Timestamp(2026-05-30T10:00:00Z)` =
 * 5am Chicago, which downstream surfaces (iCal feed `DTSTART:...Z` with
 * `X-WR-TIMEZONE:America/Chicago`, scheduling reminders, MCP `get_setlist`
 * replies) all render as 5am for a service that starts at 10am.
 *
 * **Live exemplar (2026-05-28):** Saturday B'nei Mitzvah `cd2010f4-...`
 * stored `eventDate: "2026-05-30T10:00:00.000Z"` = 5am CDT. Authored via
 * MCP `clone_setlist_from_template` with a Z-suffixed ISO that Claude
 * constructed for "10am" intent.
 *
 * ## Behavior
 *
 * | Input shape                              | Stored Timestamp (UTC)                     |
 * |------------------------------------------|--------------------------------------------|
 * | `Date` instance                          | preserved verbatim                         |
 * | `"YYYY-MM-DD"` (date-only)               | noon America/Chicago that calendar day     |
 * | `"YYYY-MM-DDTHH:MM"` (naive datetime)    | wall-clock-local America/Chicago           |
 * | `"YYYY-MM-DDTHH:MM:SS"` (naive datetime) | wall-clock-local America/Chicago           |
 * | `"YYYY-MM-DDTHH:MM:SS.sss"` (naive)      | wall-clock-local America/Chicago           |
 * | `"...Z"` (explicit UTC zero)             | preserved verbatim (caller was explicit)   |
 * | `"...+HH:MM"` / `"...-HH:MM"` (offset)   | preserved verbatim (caller was explicit)   |
 *
 * Naive inputs are interpreted as America/Chicago because all CRC services
 * happen in that locale (iCal feed already declares
 * `X-WR-TIMEZONE:America/Chicago`). DST is handled correctly via
 * `Intl.DateTimeFormat`: 10am Chicago in May → 15:00Z (CDT, UTC-5);
 * 10am Chicago in January → 16:00Z (CST, UTC-6).
 *
 * Explicit `Z` / `±HH:MM` inputs are **preserved** rather than coerced —
 * the caller said exactly what they meant. To recover from the Z-trap on a
 * specific row, edit with a naive datetime: `update_setlist({id,
 * eventDate: "2026-05-30T10:00"})`.
 */

const TZ = "America/Chicago"

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
// Naive datetime: YYYY-MM-DDTHH:MM with optional :SS and .sss, NO TZ suffix.
const NAIVE_DATETIME_RE =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/

/** Wall-clock-Chicago → UTC ms (DST-aware via `Intl.DateTimeFormat`). */
function chicagoWallClockToUtcMs(
    year: number,
    month: number, // 1..12
    day: number,
    hour: number,
    minute: number,
    second: number,
    ms: number,
): number {
    // Pretend the wall-clock IS UTC (at second-precision; ms re-added at end
    // so the offset arithmetic isn't inflated by fractional drift through
    // Intl's second-precision round-trip), then ask Intl what Chicago thinks
    // the time-of-day is for that moment. The delta is Chicago's UTC offset
    // at that wall clock — same magnitude regardless of which side anchors
    // (true everywhere outside the DST-flip 2am window, which is never a
    // service time).
    const asUtcSecMs = Date.UTC(year, month - 1, day, hour, minute, second, 0)
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    })
    const parts = fmt.formatToParts(new Date(asUtcSecMs))
    const get = (t: string) =>
        Number(parts.find((p) => p.type === t)?.value ?? 0)
    const chicagoUtcMs = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    )
    const offsetMs = asUtcSecMs - chicagoUtcMs
    return asUtcSecMs + offsetMs + ms
}

export function parseEventDate(value: Date | string): Timestamp {
    if (value instanceof Date) return Timestamp.fromDate(value)

    if (typeof value !== "string") {
        // Defensive: callers are typed `Date | string`, but MCP inputs can
        // arrive as numbers etc. Coerce via `new Date(value)` — caller bug,
        // but don't throw mid-write.
        return Timestamp.fromDate(new Date(value as unknown as string))
    }

    if (DATE_ONLY_RE.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        return Timestamp.fromDate(
            new Date(chicagoWallClockToUtcMs(y, m, d, 12, 0, 0, 0)),
        )
    }

    const naive = NAIVE_DATETIME_RE.exec(value)
    if (naive) {
        const [, y, m, d, hh, mm, ss, fracStr] = naive
        const ms = fracStr
            ? Math.round(Number(`0.${fracStr}`) * 1000)
            : 0
        return Timestamp.fromDate(
            new Date(
                chicagoWallClockToUtcMs(
                    Number(y),
                    Number(m),
                    Number(d),
                    Number(hh),
                    Number(mm),
                    Number(ss ?? 0),
                    ms,
                ),
            ),
        )
    }

    // Anything with explicit TZ (`Z` or `±HH:MM`) — caller was explicit; honor it.
    return Timestamp.fromDate(new Date(value))
}
