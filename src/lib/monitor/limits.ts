/**
 * Wedge ceilings (BET-4 / MIXER-03), the web side.
 *
 * Drew (the sound engineer) sets a maximum fader position for monitor sends and
 * bus masters in `config/monitor.ceilings`. The bridge enforces it (it CLAMPS a
 * level above the cap and says so in the ack); the web shows the cap as a tick
 * on each fader, lets an engineer or admin edit it, and holds a recall to it.
 *
 * Shape (shared with the bridge, see
 * docs/planning/2026-10-31-gap-analysis/BET-4-wedge-safety.md):
 *
 *   { default: { send: 0.70, master: 0.70 },
 *     perBus?: { "<busIndex>": { send?, master? } },
 *     perChannel?: { "<channelIndex>": { send? } },
 *     updatedBy, updatedAt }
 *
 * Values are fader positions 0..1. The most specific value wins, exactly as in
 * the bridge's `ceilingFor` (bridge/src/ceilings.ts): for a send, perChannel →
 * perBus → default; for a bus master, perBus → default. Absent, unreadable or
 * malformed values fall through to the next less specific one and finally to
 * the defaults (0.70 / 0.70, about -2 dB); nothing ever lifts a cap to 1.0 by accident.
 *
 * Pure and client-safe: no Firestore, no server imports.
 */

export const DEFAULT_SEND_CEILING = 0.7
export const DEFAULT_MASTER_CEILING = 0.7

/** Double-tap reset target when a channel has no saved level (about -6 dB). */
export const FALLBACK_HOME_LEVEL = 0.6

export type CeilingKind = "send" | "master"

export interface CeilingLevels {
    send?: number
    master?: number
}

export interface MonitorCeilings {
    default: { send: number; master: number }
    perBus?: Record<string, CeilingLevels>
    perChannel?: Record<string, { send?: number }>
    updatedBy?: string
    updatedAt?: unknown
}

/** Monitor bus indices (1-5 on CRC's X32) and input channels (1-32). */
export const CEILING_BUS_MIN = 1
export const CEILING_BUS_MAX = 5
export const CEILING_CHANNEL_MIN = 1
export const CEILING_CHANNEL_MAX = 32

function asLevel(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/** The cap for one target, from whatever is stored at `config/monitor.ceilings`. */
export function ceilingFor(raw: unknown, kind: CeilingKind, busIndex: number, channelIndex?: number): number {
    const doc = asRecord(raw)
    const def = asRecord(doc?.default)
    const fallback = asLevel(def?.[kind]) ?? (kind === "send" ? DEFAULT_SEND_CEILING : DEFAULT_MASTER_CEILING)
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
 * The stored ceilings, made whole: valid values kept, invalid ones dropped,
 * defaults filled in (0.70 / 0.70). `stored` is false when nothing usable was stored, so the
 * defaults apply.
 */
export function normalizeCeilings(raw: unknown): { ceilings: MonitorCeilings; stored: boolean } {
    const doc = asRecord(raw)
    const def = asRecord(doc?.default)
    const out: MonitorCeilings = {
        default: {
            send: asLevel(def?.send) ?? DEFAULT_SEND_CEILING,
            master: asLevel(def?.master) ?? DEFAULT_MASTER_CEILING,
        },
    }
    const perBus: Record<string, CeilingLevels> = {}
    for (const [k, v] of Object.entries(asRecord(doc?.perBus) ?? {})) {
        const n = Number(k)
        if (!Number.isInteger(n) || n < CEILING_BUS_MIN || n > CEILING_BUS_MAX) continue
        const r = asRecord(v)
        const levels: CeilingLevels = {}
        const s = asLevel(r?.send)
        const m = asLevel(r?.master)
        if (s !== undefined) levels.send = s
        if (m !== undefined) levels.master = m
        if (Object.keys(levels).length) perBus[String(n)] = levels
    }
    const perChannel: Record<string, { send?: number }> = {}
    for (const [k, v] of Object.entries(asRecord(doc?.perChannel) ?? {})) {
        const n = Number(k)
        if (!Number.isInteger(n) || n < CEILING_CHANNEL_MIN || n > CEILING_CHANNEL_MAX) continue
        const s = asLevel(asRecord(v)?.send)
        if (s !== undefined) perChannel[String(n)] = { send: s }
    }
    if (Object.keys(perBus).length) out.perBus = perBus
    if (Object.keys(perChannel).length) out.perChannel = perChannel
    if (typeof doc?.updatedBy === "string") out.updatedBy = doc.updatedBy
    if (doc?.updatedAt !== undefined) out.updatedAt = doc.updatedAt
    return { ceilings: out, stored: !!def && (asLevel(def.send) !== undefined || asLevel(def.master) !== undefined) }
}

/** A requested change to the ceilings. `null` on a per-bus/per-channel entry removes that override. */
export interface CeilingsPatch {
    default?: CeilingLevels
    perBus?: Record<string, CeilingLevels | null>
    perChannel?: Record<string, { send?: number } | null>
}

/**
 * Merge a patch over the current ceilings. Returns the full new value (without
 * updatedBy/updatedAt — the writer stamps those) or an error naming the first
 * bad value. Values must be fader positions 0..1; bus keys 1-5; channel keys 1-32.
 */
export function applyCeilingsPatch(
    current: unknown,
    patch: CeilingsPatch,
): { ok: true; ceilings: MonitorCeilings } | { ok: false; field: string } {
    const { ceilings } = normalizeCeilings(current)
    const next: MonitorCeilings = {
        default: { ...ceilings.default },
        perBus: { ...(ceilings.perBus ?? {}) },
        perChannel: { ...(ceilings.perChannel ?? {}) },
    }
    const check = (v: unknown): number | undefined | false => {
        if (v === undefined) return undefined
        const l = asLevel(v)
        return l === undefined ? false : l
    }
    for (const kind of ["send", "master"] as const) {
        const v = check(patch.default?.[kind])
        if (v === false) return { ok: false, field: `default.${kind}` }
        if (v !== undefined) next.default[kind] = v
    }
    for (const [k, v] of Object.entries(patch.perBus ?? {})) {
        const n = Number(k)
        if (!Number.isInteger(n) || n < CEILING_BUS_MIN || n > CEILING_BUS_MAX) return { ok: false, field: `perBus.${k}` }
        if (v === null) {
            delete next.perBus![String(n)]
            continue
        }
        const levels: CeilingLevels = { ...(next.perBus![String(n)] ?? {}) }
        for (const kind of ["send", "master"] as const) {
            const l = check(v[kind])
            if (l === false) return { ok: false, field: `perBus.${k}.${kind}` }
            if (l !== undefined) levels[kind] = l
        }
        if (Object.keys(levels).length) next.perBus![String(n)] = levels
        else delete next.perBus![String(n)]
    }
    for (const [k, v] of Object.entries(patch.perChannel ?? {})) {
        const n = Number(k)
        if (!Number.isInteger(n) || n < CEILING_CHANNEL_MIN || n > CEILING_CHANNEL_MAX) {
            return { ok: false, field: `perChannel.${k}` }
        }
        if (v === null) {
            delete next.perChannel![String(n)]
            continue
        }
        const l = check(v.send)
        if (l === false) return { ok: false, field: `perChannel.${k}.send` }
        if (l !== undefined) next.perChannel![String(n)] = { send: l }
    }
    if (!Object.keys(next.perBus!).length) delete next.perBus
    if (!Object.keys(next.perChannel!).length) delete next.perChannel
    return { ok: true, ceilings: next }
}

/**
 * X32 fader position (0..1) to dB, using the desk's own four-segment taper.
 * Returns null at zero (silence). 0.75 is 0 dB, 0.70 is -2 dB, 0.80 is +2 dB, 0.60 is -6 dB,
 * 1.0 is +10 dB.
 */
export function faderToDb(level: number): number | null {
    if (typeof level !== "number" || !Number.isFinite(level) || level <= 0) return null
    const f = Math.min(level, 1)
    const d = f >= 0.5 ? f * 40 - 30 : f >= 0.25 ? f * 80 - 50 : f >= 0.0625 ? f * 160 - 70 : f * 480 - 90
    return Math.round(d * 10) / 10
}

/**
 * dB text for a fader position: "+2 dB", "−6 dB", "0 dB", or "−∞ dB" at
 * silence. Uses a true minus sign; numbers are locale-neutral.
 */
export function formatDb(level: number): string {
    const db = faderToDb(level)
    if (db == null) return "−∞ dB"
    const rounded = Math.abs(db) >= 10 ? Math.round(db) : Math.round(db * 10) / 10
    if (rounded === 0) return "0 dB"
    const sign = rounded > 0 ? "+" : "−"
    return `${sign}${Math.abs(rounded)} dB`
}

/**
 * Where a double-tap sends a fader: the channel's last saved level, or 0.6
 * (about -6 dB) when nothing is saved, never above the limit. It used to toggle
 * between 0 and 0.75 (0 dB), a jump with no ramp straight to unity.
 */
export function doubleTapTarget(home: number | null | undefined, cap?: number | null): number {
    const base = typeof home === "number" && Number.isFinite(home) && home >= 0 && home <= 1 ? home : FALLBACK_HOME_LEVEL
    return typeof cap === "number" && Number.isFinite(cap) ? Math.min(base, cap) : base
}
