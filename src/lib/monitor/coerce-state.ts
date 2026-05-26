/**
 * Shared defensive coercion for the live mixer snapshot (`monitor-live/state`).
 *
 * AUDIT-consumers C-4: before this, three readers coerced a corrupted /
 * non-array `state.buses` three different, divergent ways — the iPad client
 * kept survivors via `Object.values`, the MCP server's `safeArray` dropped
 * everything, and `get_mix` did neither and THREW (`i.buses.find is not a
 * function`). Phase-1's full-state writes remove the corruption at the source,
 * but the consumer plane should still degrade *identically + safely* if a bad
 * write ever lands again.
 *
 * This module is the ONE consumer-side guard. The "keep survivors" policy is
 * deliberate for a read surface: showing the buses that DID round-trip is
 * strictly better for a musician than showing none. Pure + framework-free so
 * it is unit-testable and safe to import from the non-React transport client.
 */

import type {
    BusInfo,
    ChannelInfo,
    MatrixInfo,
    MixerSnapshot,
} from "@/types/monitor"

/**
 * Coerce an unknown value into a real array.
 *
 * Firestore returns a stored array as-is, but a dot-path `update()` that
 * targets `buses.N.fader` silently rewrites the ARRAY into a MAP keyed by
 * stringified index (`{ "5": {…} }`). `Object.values` recovers the surviving
 * entries from that map; anything else (null, scalar, undefined) becomes `[]`.
 */
export function coerceArray<T>(val: unknown): T[] {
    if (Array.isArray(val)) return val as T[]
    if (val && typeof val === "object") {
        return Object.values(val as Record<string, T>)
    }
    return []
}

/**
 * Normalize a raw `monitor-live/state` document into a well-formed
 * MixerSnapshot with guaranteed-array `channels` / `buses` / `matrices`, and
 * every `bus.sends` an array. Never throws on a corrupted shape.
 *
 * `config` is passed through untouched: the store no longer relies on the
 * bridge-embedded `state.config` (AUDIT-consumers C-7 — P1-A is removing it),
 * so its absence here is expected and harmless.
 */
export function coerceMixerSnapshot(raw: unknown): MixerSnapshot {
    const data = (raw && typeof raw === "object" ? raw : {}) as Partial<MixerSnapshot>
    return {
        channels: coerceArray<ChannelInfo>(data.channels),
        buses: coerceArray<Record<string, unknown>>(data.buses).map((b) => {
            // master-mute: read explicit `on` if present; default `true` (unmuted)
            // for back-compat with pre-v10.0.7 bridges that didn't publish the slot
            // — conservative reading so a fresh-install iPad doesn't show a master
            // as muted on first frame.
            const raw = b as { on?: unknown; sends?: unknown }
            const on = typeof raw.on === "boolean" ? raw.on : true
            return {
                ...(b as object),
                on,
                sends: coerceArray(raw.sends),
            }
        }) as BusInfo[],
        matrices: coerceArray<MatrixInfo>(data.matrices),
        config: data.config as MixerSnapshot["config"],
    }
}
