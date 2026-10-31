/**
 * Wedge ceilings (BET-4 / MIXER-03).
 *
 * Drew (the sound engineer) sets a maximum fader position for monitor sends and
 * bus masters in `config/monitor.ceilings`. The bridge enforces it here for every
 * `set_send_level` and `set_bus_master` command, whether it came from an iPad or
 * from the MCP: a level above the cap is CLAMPED to the cap (never refused), and
 * the ack says so, so the fader can show "Limited to … by the sound engineer's
 * limit".
 *
 * Shape (shared with the web, see docs/planning/2026-10-31-gap-analysis/BET-4-wedge-safety.md):
 *
 *   { default: { send: 0.70, master: 0.70 },
 *     perBus?: { "<busIndex>": { send?, master? } },
 *     perChannel?: { "<channelIndex>": { send? } },
 *     updatedBy, updatedAt }
 *
 * Values are fader positions 0..1. The most specific value wins: for a send,
 * perChannel → perBus → default; for a bus master, perBus → default.
 *
 * Fail safe: when the field is absent, unreadable or malformed, the defaults
 * (0.70 / 0.70) apply. By the X32 fader law (dB = f*40-30 above 0.5) 0.70 is
 * -2 dB, the level Daniel ruled; 0.80 would be +2 dB. A single bad value falls through to the next
 * less specific one; it never lifts the cap to 1.0.
 */

export const DEFAULT_SEND_CEILING = 0.7
export const DEFAULT_MASTER_CEILING = 0.7

export interface ClampResult {
    /** The level to send to the desk. */
    value: number
    /** Present only when the request was above the cap. */
    clamped?: { requested: number; applied: number; cap: number }
}

type Level = number | undefined

function asLevel(v: unknown): Level {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/**
 * The cap for one target. `kind` is "send" (needs channelIndex) or "master".
 * `raw` is whatever is stored at `config/monitor.ceilings` (may be anything).
 */
export function ceilingFor(
    raw: unknown,
    kind: "send" | "master",
    busIndex: number,
    channelIndex?: number,
): number {
    const doc = asRecord(raw)
    const def = asRecord(doc?.default)
    const fallback =
        asLevel(def?.[kind]) ?? (kind === "send" ? DEFAULT_SEND_CEILING : DEFAULT_MASTER_CEILING)
    const bus = asRecord(asRecord(doc?.perBus)?.[String(busIndex)])
    const busLevel = asLevel(bus?.[kind])
    if (kind === "send" && channelIndex !== undefined) {
        const ch = asRecord(asRecord(doc?.perChannel)?.[String(channelIndex)])
        const chLevel = asLevel(ch?.send)
        if (chLevel !== undefined) return chLevel
    }
    return busLevel ?? fallback
}

/**
 * Clamp a requested level to the cap. A request at or below the cap passes
 * through unchanged (no `clamped`).
 */
export function clampToCeiling(
    raw: unknown,
    kind: "send" | "master",
    requested: number,
    busIndex: number,
    channelIndex?: number,
): ClampResult {
    const cap = ceilingFor(raw, kind, busIndex, channelIndex)
    if (requested > cap) {
        return { value: cap, clamped: { requested, applied: cap, cap } }
    }
    return { value: requested }
}
