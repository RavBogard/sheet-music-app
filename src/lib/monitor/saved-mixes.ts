/**
 * Saved mixes (BET-4 / MIXER-01), the pure part shared by the web and the MCP.
 *
 * A snapshot is one bus's levels at one moment:
 *
 *   monitor-live/snapshots/buses/{busIndex}/items/{snapshotId}
 *   { busIndex, kind: "auto"|"named", name?, serviceType?, ownerUid?,
 *     createdAt, sends: [{channelIndex, channelName, level, on}], master }
 *
 * The spec wrote the path as `monitor-live/snapshots/{busIndex}/items/{id}`,
 * which has an odd number of segments and so names a collection, not a
 * document. The `buses` container makes it a valid document path while keeping
 * every name the spec used (see BET-4-wedge-safety.md, "Shared data model").
 *
 * Auto snapshots are the bridge's (one per owned bus at service end, last 10
 * kept). Named snapshots are a musician's own, never shared between people.
 *
 * Recall matches each saved channel to the desk by NAME first, so a renumbered
 * desk still lands the right levels, then by index when the name is blank on
 * either side. A channel whose name is now on no channel is reported, never
 * guessed. Every target is held to the ceiling, and the move is ramped.
 */

import { ceilingFor, faderToDb } from "@/lib/monitor/limits"

export const SNAPSHOTS_ROOT = ["monitor-live", "snapshots", "buses"] as const

/** How many auto snapshots the recall list offers (the bridge keeps 10). */
export const RECALL_AUTO_COUNT = 3

/** A named mix's name: 1-60 characters after trimming. */
export const MIX_NAME_MAX = 60

/** Ramp: this many steps, this far apart. 5 × 150 ms ≈ 0.75 s end to end. */
export const RECALL_STEPS = 5
export const RECALL_STEP_MS = 150

/** Below this a level difference is not worth moving a fader for. */
const LEVEL_EPSILON = 0.005

export type SnapshotKind = "auto" | "named"

export interface SnapshotSend {
    channelIndex: number
    channelName: string
    level: number
    on: boolean
}

export interface MixSnapshot {
    id: string
    busIndex: number
    kind: SnapshotKind
    name: string | null
    serviceType: string | null
    ownerUid: string | null
    /** Epoch millis; 0 when the stored stamp could not be read. */
    createdAt: number
    sends: SnapshotSend[]
    master: number | null
}

function toMillis(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") {
        const ms = Date.parse(v)
        return Number.isNaN(ms) ? 0 : ms
    }
    if (v && typeof v === "object") {
        const o = v as { toMillis?: () => number; seconds?: number; _seconds?: number }
        if (typeof o.toMillis === "function") {
            try {
                return o.toMillis()
            } catch {
                return 0
            }
        }
        if (typeof o.seconds === "number") return o.seconds * 1000
        if (typeof o._seconds === "number") return o._seconds * 1000
    }
    return 0
}

function isLevel(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1
}

/** A stored snapshot document, read defensively. Null when it holds nothing usable. */
export function coerceSnapshot(id: string, raw: unknown, busIndexFromPath?: number): MixSnapshot | null {
    if (!raw || typeof raw !== "object") return null
    const d = raw as Record<string, unknown>
    const busIndex = typeof d.busIndex === "number" ? d.busIndex : busIndexFromPath
    if (typeof busIndex !== "number" || !Number.isInteger(busIndex)) return null
    const sends: SnapshotSend[] = []
    for (const s of Array.isArray(d.sends) ? d.sends : []) {
        if (!s || typeof s !== "object") continue
        const o = s as Record<string, unknown>
        if (typeof o.channelIndex !== "number" || !isLevel(o.level)) continue
        sends.push({
            channelIndex: o.channelIndex,
            channelName: typeof o.channelName === "string" ? o.channelName : "",
            level: o.level,
            on: o.on !== false,
        })
    }
    const master = isLevel(d.master) ? d.master : null
    if (!sends.length && master == null) return null
    return {
        id,
        busIndex,
        kind: d.kind === "named" ? "named" : "auto",
        name: typeof d.name === "string" && d.name.trim() ? d.name.trim() : null,
        serviceType: typeof d.serviceType === "string" ? d.serviceType : null,
        ownerUid: typeof d.ownerUid === "string" ? d.ownerUid : null,
        createdAt: toMillis(d.createdAt),
        sends,
        master,
    }
}

/**
 * Who may see a snapshot: a named mix only its owner; an auto snapshot anyone
 * who may control that bus (the caller checks bus control before this).
 */
export function canSeeSnapshot(s: MixSnapshot, uid: string): boolean {
    return s.kind === "auto" || s.ownerUid === uid
}

/** The recall list: the caller's named mixes (newest first) and the last few auto snapshots. */
export function recallList(
    all: MixSnapshot[],
    uid: string,
    autoCount = RECALL_AUTO_COUNT,
): { named: MixSnapshot[]; auto: MixSnapshot[] } {
    const visible = all.filter((s) => canSeeSnapshot(s, uid)).sort((a, b) => b.createdAt - a.createdAt)
    return {
        named: visible.filter((s) => s.kind === "named"),
        auto: visible.filter((s) => s.kind === "auto").slice(0, autoCount),
    }
}

/**
 * The "home" level per channel and for the master: the newest visible
 * snapshot's levels. Double-tap resets to this (or 0.6 when there is none).
 */
export function homeLevelsFrom(list: { named: MixSnapshot[]; auto: MixSnapshot[] }): {
    master: number | null
    sends: Record<number, number>
} {
    const newest = [...list.named, ...list.auto].sort((a, b) => b.createdAt - a.createdAt)[0]
    if (!newest) return { master: null, sends: {} }
    const sends: Record<number, number> = {}
    for (const s of newest.sends) sends[s.channelIndex] = s.level
    return { master: newest.master, sends }
}

// ─── Recall plan ─────────────────────────────────────────────────────────────

export interface LiveBus {
    index: number
    fader: number
    sends: Array<{ channelIndex: number; level: number; on: boolean }>
}

export interface LiveChannel {
    index: number
    name: string
}

export interface RecallChange {
    target: "master" | "send"
    channelIndex: number | null
    channelName: string
    matchedBy: "name" | "index" | null
    fromLevel: number
    toLevel: number
    fromOn: boolean
    toOn: boolean
    fromDb: number | null
    toDb: number | null
    /** The saved level was above the ceiling; `toLevel` is the cap. */
    clamped: boolean
}

export interface RecallPlan {
    busIndex: number
    changes: RecallChange[]
    /** Saved channels whose name is on no channel of the desk now. */
    unmatched: Array<{ channelIndex: number; channelName: string }>
    /** Saved channels that already match the desk. */
    unchanged: number
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/** Find the desk channel a saved send belongs to. */
function matchChannel(
    saved: SnapshotSend,
    channels: LiveChannel[],
): { index: number; by: "name" | "index" } | null {
    // No channel names on the desk at all (an older state doc): index is all we have.
    if (channels.length === 0) return { index: saved.channelIndex, by: "index" }
    const want = norm(saved.channelName)
    if (want) {
        const byName = channels.filter((c) => norm(c.name) === want)
        if (byName.length === 1) return { index: byName[0].index, by: "name" }
        if (byName.length > 1) {
            // Two channels share the name: the saved index breaks the tie.
            const same = byName.find((c) => c.index === saved.channelIndex)
            return same ? { index: same.index, by: "name" } : null
        }
    }
    // No name saved, or the name is gone: fall back to the index only when that
    // channel has no name of its own to contradict it.
    const atIndex = channels.find((c) => c.index === saved.channelIndex)
    if (atIndex && (!want || !norm(atIndex.name))) return { index: atIndex.index, by: "index" }
    return null
}

export function planRecall(
    snapshot: MixSnapshot,
    live: LiveBus,
    channels: LiveChannel[],
    ceilingsRaw: unknown,
): RecallPlan {
    const changes: RecallChange[] = []
    const unmatched: RecallPlan["unmatched"] = []
    let unchanged = 0
    const nameOf = new Map(channels.map((c) => [c.index, c.name]))

    if (snapshot.master != null) {
        const cap = ceilingFor(ceilingsRaw, "master", live.index)
        const toLevel = Math.min(snapshot.master, cap)
        if (Math.abs(toLevel - live.fader) > LEVEL_EPSILON) {
            changes.push({
                target: "master",
                channelIndex: null,
                channelName: "",
                matchedBy: null,
                fromLevel: live.fader,
                toLevel,
                fromOn: true,
                toOn: true,
                fromDb: faderToDb(live.fader),
                toDb: faderToDb(toLevel),
                clamped: snapshot.master > cap,
            })
        } else unchanged++
    }

    const seen = new Set<number>()
    for (const saved of snapshot.sends) {
        const m = matchChannel(saved, channels)
        if (!m || seen.has(m.index)) {
            if (!m) unmatched.push({ channelIndex: saved.channelIndex, channelName: saved.channelName })
            continue
        }
        seen.add(m.index)
        const current = live.sends.find((s) => s.channelIndex === m.index)
        if (!current) {
            unmatched.push({ channelIndex: saved.channelIndex, channelName: saved.channelName })
            continue
        }
        const cap = ceilingFor(ceilingsRaw, "send", live.index, m.index)
        const toLevel = Math.min(saved.level, cap)
        const levelMoves = Math.abs(toLevel - current.level) > LEVEL_EPSILON
        if (!levelMoves && current.on === saved.on) {
            unchanged++
            continue
        }
        changes.push({
            target: "send",
            channelIndex: m.index,
            channelName: nameOf.get(m.index) || saved.channelName,
            matchedBy: m.by,
            fromLevel: current.level,
            toLevel: levelMoves ? toLevel : current.level,
            fromOn: current.on,
            toOn: saved.on,
            fromDb: faderToDb(current.level),
            toDb: faderToDb(levelMoves ? toLevel : current.level),
            clamped: saved.level > cap,
        })
    }
    return { busIndex: live.index, changes, unmatched, unchanged }
}

/** The intermediate positions of a ramp, ending exactly on `to`. */
export function rampLevels(from: number, to: number, steps = RECALL_STEPS): number[] {
    const n = Math.max(1, Math.floor(steps))
    const out: number[] = []
    for (let i = 1; i <= n; i++) out.push(i === n ? to : Math.round((from + ((to - from) * i) / n) * 10000) / 10000)
    return out
}

export interface RecallCommand {
    type: "set_bus_master" | "set_send_level" | "set_send_on"
    busIndex: number
    channelIndex?: number
    value: number | boolean
}

/**
 * The plan as command waves, in order: unmutes first, then the ramp steps
 * (one wave per step, every moving fader together), then mutes last, so a
 * channel that is coming in rises from where it was and one that is going out
 * falls before it is cut.
 */
export function recallWaves(plan: RecallPlan, steps = RECALL_STEPS): RecallCommand[][] {
    const b = plan.busIndex
    const unmute: RecallCommand[] = []
    const mute: RecallCommand[] = []
    const ramps: RecallCommand[][] = Array.from({ length: Math.max(1, steps) }, () => [])
    for (const c of plan.changes) {
        if (c.target === "send" && c.channelIndex != null && c.fromOn !== c.toOn) {
            ;(c.toOn ? unmute : mute).push({ type: "set_send_on", busIndex: b, channelIndex: c.channelIndex, value: c.toOn })
        }
        if (Math.abs(c.toLevel - c.fromLevel) <= LEVEL_EPSILON) continue
        rampLevels(c.fromLevel, c.toLevel, steps).forEach((v, i) => {
            ramps[i].push(
                c.target === "master"
                    ? { type: "set_bus_master", busIndex: b, value: v }
                    : { type: "set_send_level", busIndex: b, channelIndex: c.channelIndex!, value: v },
            )
        })
    }
    return [unmute, ...ramps, mute].filter((w) => w.length > 0)
}
