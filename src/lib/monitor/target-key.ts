/**
 * Monitor target keys — the ONE key space shared by the bridge and the iPad.
 *
 * The bridge already names every controllable slot on the desk with a flat
 * string key, in three separate places that must agree:
 *
 *   - `x32-client.ts syncFullState()` → the B11 `unconfirmed` set
 *     (`bus_fader:5`, `send_level:3:5`, …) — "we could NOT read this; the 0 you
 *     see is fabricated".
 *   - `firestore-transport.ts confirmKeyFor()` → the C2 read-back / ack key.
 *   - `firestore-transport.ts resolvePendingAck()` → the change-event key.
 *
 * Consumers previously had no way to name a slot, which is exactly why both
 * `unconfirmed` (R5) and the per-command ack surface (R2) were unusable on the
 * iPad: the data arrived keyed by a vocabulary the client did not speak. This
 * module is that vocabulary, and it MUST stay byte-identical to
 * `confirmKeyFor` / the `unconfirmed.add(...)` literals — a drift here degrades
 * silently (a fader simply never matches its own ack or unconfirmed marker),
 * so `target-key.test.ts` pins every literal against the bridge's spelling.
 *
 * Note the deliberate asymmetry inherited from the bridge: send keys are
 * `send_*:<channelIndex>:<busIndex>` — CHANNEL first, then bus, the reverse of
 * the command argument order (`setSendLevel(busIndex, channelIndex)`). Getting
 * that backwards is the obvious failure mode; it is pinned by test.
 */

/** A command as written to `monitor-live/commands/pending`. */
export interface CommandShape {
    type?: unknown
    busIndex?: unknown
    channelIndex?: unknown
    matrixIndex?: unknown
}

export const busFaderKey = (busIndex: number) => `bus_fader:${busIndex}`
export const busOnKey = (busIndex: number) => `bus_on:${busIndex}`
export const sendLevelKey = (channelIndex: number, busIndex: number) =>
    `send_level:${channelIndex}:${busIndex}`
export const sendOnKey = (channelIndex: number, busIndex: number) =>
    `send_on:${channelIndex}:${busIndex}`
export const matrixFaderKey = (matrixIndex: number) => `matrix_fader:${matrixIndex}`
export const matrixOnKey = (matrixIndex: number) => `matrix_on:${matrixIndex}`

/**
 * Target key for an outgoing command, or null when the shape is incomplete.
 * Mirrors the bridge's `confirmKeyFor` exactly, including its null-on-missing-
 * field behaviour, so a command the bridge would reject as malformed also gets
 * no client-side key (and therefore no ack watch that could never resolve).
 */
export function commandTargetKey(cmd: CommandShape): string | null {
    const bus = typeof cmd.busIndex === "number" ? cmd.busIndex : null
    const ch = typeof cmd.channelIndex === "number" ? cmd.channelIndex : null
    const mtx = typeof cmd.matrixIndex === "number" ? cmd.matrixIndex : null

    switch (cmd.type) {
        case "set_bus_master":
            return bus != null ? busFaderKey(bus) : null
        case "set_bus_on":
            return bus != null ? busOnKey(bus) : null
        case "set_send_level":
            return bus != null && ch != null ? sendLevelKey(ch, bus) : null
        case "set_send_on":
            return bus != null && ch != null ? sendOnKey(ch, bus) : null
        case "set_matrix_fader":
            return mtx != null ? matrixFaderKey(mtx) : null
        case "set_matrix_on":
            return mtx != null ? matrixOnKey(mtx) : null
        default:
            return null
    }
}

/** A parsed target key — which slot on the desk a key names. */
export type ParsedTarget =
    | { kind: "bus_fader"; busIndex: number }
    | { kind: "bus_on"; busIndex: number }
    | { kind: "send_level"; channelIndex: number; busIndex: number }
    | { kind: "send_on"; channelIndex: number; busIndex: number }
    | { kind: "matrix_fader"; matrixIndex: number }
    | { kind: "matrix_on"; matrixIndex: number }

/**
 * Inverse of the key builders — used by the store to route a rejection's
 * rollback to the right slot. Returns null for anything unrecognized (a newer
 * bridge inventing a key must degrade to "no rollback", never to a wrong write).
 */
export function parseTargetKey(key: string): ParsedTarget | null {
    const parts = key.split(":")
    const num = (s: string | undefined): number | null => {
        if (s == null || s === "") return null
        const n = Number(s)
        return Number.isInteger(n) ? n : null
    }

    if (parts.length === 2) {
        const idx = num(parts[1])
        if (idx == null) return null
        switch (parts[0]) {
            case "bus_fader":
                return { kind: "bus_fader", busIndex: idx }
            case "bus_on":
                return { kind: "bus_on", busIndex: idx }
            case "matrix_fader":
                return { kind: "matrix_fader", matrixIndex: idx }
            case "matrix_on":
                return { kind: "matrix_on", matrixIndex: idx }
            default:
                return null
        }
    }

    if (parts.length === 3) {
        // NOTE the order: channel FIRST, then bus (the bridge's spelling).
        const ch = num(parts[1])
        const bus = num(parts[2])
        if (ch == null || bus == null) return null
        if (parts[0] === "send_level") return { kind: "send_level", channelIndex: ch, busIndex: bus }
        if (parts[0] === "send_on") return { kind: "send_on", channelIndex: ch, busIndex: bus }
    }

    return null
}

/** True when `key` appears in the bridge's published `unconfirmed` list. */
export function isUnconfirmed(unconfirmed: string[] | undefined, key: string): boolean {
    return !!unconfirmed && unconfirmed.includes(key)
}
