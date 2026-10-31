import { toDate } from "@/lib/firestore-helpers"

type Stamped = { version?: unknown; updatedAt?: unknown } | null | undefined

function millis(value: unknown): number | null {
    if (value === null || value === undefined) return null
    try {
        const d = toDate(value as never)
        const ms = d ? d.getTime() : NaN
        return Number.isFinite(ms) ? ms : null
    } catch {
        return null
    }
}

/**
 * PERF-06: has the live setlist doc moved past the frame the server rendered?
 * Prefers the numeric `version` (every MCP write bumps it), else `updatedAt`.
 * Anything missing, unreadable or equal answers false, so the strip never
 * shows on a guess.
 */
export function setlistMovedPast(initial: Stamped, live: Stamped): boolean {
    if (!initial || !live) return false
    if (typeof initial.version === "number" && typeof live.version === "number") {
        return live.version > initial.version
    }
    const a = millis(initial.updatedAt)
    const b = millis(live.updatedAt)
    if (a === null || b === null) return false
    return b > a
}
