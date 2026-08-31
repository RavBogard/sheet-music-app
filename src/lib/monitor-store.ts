/**
 * Monitor Store
 * 
 * Zustand store for the monitor mixer UI state.
 * Manages connection, mixer state, and user's assigned bus.
 */

import { create } from "zustand"
import { ConnectionStatus } from "@/lib/firestore-monitor-client"
import {
    MonitorConfig,
    ChannelInfo,
    BusAssignment,
    BusInfo,
    BusSend,
    MatrixInfo,
    MixerSnapshot,
} from "@/types/monitor"
import { logger } from "@/lib/logger"
import {
    busFaderKey,
    busOnKey,
    matrixFaderKey,
    matrixOnKey,
    parseTargetKey,
    sendLevelKey,
    sendOnKey,
} from "@/lib/monitor/target-key"

/** Shallow compare two arrays by length and element reference */
function shallowEqualArray<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/**
 * Find the first bus assigned to the given user.
 * Supports both legacy single-assignment and new multi-assignment (array) formats.
 */
function findUserBus(busAssignments: Record<string, BusAssignment | BusAssignment[] | null>, userId: string): number | null {
    for (const [busStr, assignment] of Object.entries(busAssignments)) {
        if (!assignment) continue
        const assignments = Array.isArray(assignment) ? assignment : [assignment]
        if (assignments.some(a => a.userId === userId)) {
            return parseInt(busStr)
        }
    }
    return null
}

/**
 * Derive the user's assigned bus from the authoritative `config/monitor` copy
 * (held in the store via `setConfig`). AUDIT-consumers C-7: this is the SINGLE
 * source of `myBusIndex` — never the bridge-embedded `snapshot.config`, which
 * P1-A is removing and which could disagree with `config/monitor`.
 */
function deriveMyBusIndex(config: MonitorConfig | null, userId: string | null): number | null {
    if (!config?.busAssignments || !userId) return null
    return findUserBus(config.busAssignments, userId)
}

/**
 * Pure function: compute visible channels for live mode.
 * Returns channel indices from the union of defaultChannels + starredChannels,
 * filtered to only channels that have sends on the user's bus, deduped.
 */
export function getVisibleChannels(
    defaultChannels: number[],
    starredChannels: number[],
    busSends: BusSend[],
): number[] {
    const visible = new Set([...defaultChannels, ...starredChannels])
    const sendIndices = new Set(busSends.map(s => s.channelIndex))
    return [...visible].filter(ch => sendIndices.has(ch))
}

interface MonitorState {
    // Connection
    status: ConnectionStatus
    error: string | null

    // Mixer state from bridge
    channels: ChannelInfo[]
    buses: BusInfo[]
    matrices: MatrixInfo[]
    config: MonitorConfig | null
    /**
     * R5 — target keys the bridge could not READ from the desk (B11). The value
     * shown for these is a fabricated 0/false; the UI must say so rather than
     * print a confident level.
     */
    unconfirmed: string[]
    /**
     * R2 — the latest rejection per target key. `seq` is monotonic so a repeat
     * rejection of the same fader re-fires the cue (a bare reason string would
     * be reference-equal and the effect would not run).
     */
    rejections: Record<string, { reason: string; seq: number }>
    /**
     * R2 — the authoritative value captured immediately BEFORE the first
     * optimistic write to each target, so a rejection can put the exact number
     * back. Cleared whenever a real snapshot lands (that snapshot IS the truth,
     * and a rollback to a pre-snapshot value would be a regression).
     */
    rollbacks: Record<string, number | boolean>

    // User's assigned bus
    myBusIndex: number | null
    userId: string | null

    // Channel visibility
    starredChannels: number[]
    defaultChannels: number[]

    // Connection health
    lastSnapshotAt: number
    snapshotCount: number
    /**
     * The bridge's own write time off `monitor-live/state.updatedAt` (epoch
     * millis; null before the first snapshot or when unstamped). Drives
     * staleness via `useMonitorStaleness` — the authoritative freshness signal
     * (C-6), unlike `lastSnapshotAt` which only marks when a *changed* snapshot
     * arrived and reads "fresh" on load against a frozen desk.
     */
    stateUpdatedAt: number | null

    // Actions
    setStatus: (status: ConnectionStatus, error?: string) => void
    setSnapshot: (snapshot: MixerSnapshot, userId: string, stateUpdatedAt: number | null) => void
    updateBusFader: (busIndex: number, value: number) => void
    updateBusOn: (busIndex: number, on: boolean) => void
    updateSendLevel: (busIndex: number, channelIndex: number, value: number) => void
    updateSendOn: (busIndex: number, channelIndex: number, on: boolean) => void
    updateMatrixFader: (matrixIndex: number, value: number) => void
    updateMatrixOn: (matrixIndex: number, on: boolean) => void
    setStarredChannels: (channels: number[]) => void
    setDefaultChannels: (channels: number[]) => void
    setConfig: (config: MonitorConfig) => void
    /**
     * R2 — the bridge rejected the command for `targetKey`. Roll the optimistic
     * value back to what the desk actually holds and record the reason for the
     * fader's cue. Called from the ack listener in `FirestoreMonitorClient`.
     */
    rejectCommand: (targetKey: string, reason: string) => void
    /** Clear a surfaced rejection once its cue has been shown. */
    clearRejection: (targetKey: string) => void
    reset: () => void
}

/**
 * Snapshot the current authoritative value for `key` before the first optimistic
 * write lands on it. Later optimistic writes to the same key must NOT overwrite
 * the capture — mid-drag there are ~10 of them per second, and rolling back to
 * "the value 100ms ago" instead of "the value before the drag" would leave the
 * musician at a level neither they nor the desk ever chose.
 */
function captureRollback(
    rollbacks: Record<string, number | boolean>,
    key: string,
    previous: number | boolean | undefined,
): Record<string, number | boolean> {
    if (previous === undefined) return rollbacks
    if (key in rollbacks) return rollbacks
    return { ...rollbacks, [key]: previous }
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
    status: "disconnected",
    error: null,
    channels: [],
    buses: [],
    matrices: [],
    config: null,
    unconfirmed: [],
    rejections: {},
    rollbacks: {},
    myBusIndex: null,
    userId: null,
    starredChannels: [],
    defaultChannels: [],
    lastSnapshotAt: 0,
    snapshotCount: 0,
    stateUpdatedAt: null,

    setStatus: (status, error) => set({ status, error: error || null }),

    setSnapshot: (snapshot, userId, stateUpdatedAt) => {
        const state = get()

        // Always update health tracking (even if data unchanged). C-6: carry
        // the bridge's own write time so an idle/frozen desk reads stale.
        // R2: an authoritative snapshot supersedes every captured pre-optimistic
        // value — rolling back to one AFTER the desk has spoken would undo a real
        // change (a co-owner's move, or the engineer's).
        const healthUpdate = {
            lastSnapshotAt: Date.now(),
            snapshotCount: state.snapshotCount + 1,
            stateUpdatedAt,
            rollbacks: {},
        }

        // Stale-while-revalidate: Ignore empty/malformed snapshots if we already have valid data.
        // C-8: do NOT advance `stateUpdatedAt` here — an empty/malformed snapshot must not
        // refresh the freshness clock, or the frozen last-good values would read "Live"
        // indefinitely and mask a real problem. Holding the prior `stateUpdatedAt` lets
        // `useMonitorStaleness` age out and raise the staleness cue. We still bump
        // `snapshotCount` (we got a ping) and `lastSnapshotAt`.
        if (snapshot.buses.length === 0 && state.buses.length > 0) {
            logger.warn("[MonitorStore] Received empty snapshot, freezing last known good state (freshness clock held — C-8)")
            set({
                lastSnapshotAt: Date.now(),
                snapshotCount: state.snapshotCount + 1,
            })
            return
        }

        // C-7: derive the user's bus from the authoritative config/monitor copy
        // in the store, NEVER from the bridge-embedded snapshot.config.
        const myBusIndex = deriveMyBusIndex(state.config, userId)

        const matrices = snapshot.matrices || []
        // R5: the B11 "we could not read this" list, carried through coercion.
        const unconfirmed = snapshot.unconfirmed || []

        // Shallow equality check — skip store update if nothing changed
        const channelsSame = shallowEqualArray(state.channels, snapshot.channels)
        const busesSame = shallowEqualArray(state.buses, snapshot.buses)
        const matricesSame = shallowEqualArray(state.matrices, matrices)
        // Strings compare by value under ===, so unlike the object arrays above
        // this one is a genuine content check, not a reference check.
        const unconfirmedSame = shallowEqualArray(state.unconfirmed, unconfirmed)
        const busIndexSame = state.myBusIndex === myBusIndex

        if (channelsSame && busesSame && matricesSame && unconfirmedSame && busIndexSame) {
            logger.debug("[MonitorStore] Snapshot skipped (no changes)")
            set(healthUpdate)
            return
        }

        // NOTE: `config` is intentionally NOT set from the snapshot — it is owned
        // solely by the `config/monitor` listener via setConfig (C-7).
        set({
            channels: snapshot.channels,
            buses: snapshot.buses,
            matrices,
            unconfirmed,
            myBusIndex,
            userId,
            ...healthUpdate,
        })
    },

    updateBusFader: (busIndex, value) => {
        const { buses, rollbacks } = get()
        set({
            buses: buses.map(b =>
                b.index === busIndex ? { ...b, fader: value } : b
            ),
            rollbacks: captureRollback(
                rollbacks,
                busFaderKey(busIndex),
                buses.find(b => b.index === busIndex)?.fader,
            ),
        })
    },

    updateBusOn: (busIndex, on) => {
        // Optimistic master-mute write — mirrors `updateMatrixOn` shape so the
        // fader confirmation machine (C-2) sees the local set, then reconciles
        // against the bridge's authoritative snapshot once the OSC round-trip
        // lands on `/bus/MM/mix/on`.
        const { buses, rollbacks } = get()
        set({
            buses: buses.map(b =>
                b.index === busIndex ? { ...b, on } : b
            ),
            rollbacks: captureRollback(
                rollbacks,
                busOnKey(busIndex),
                buses.find(b => b.index === busIndex)?.on,
            ),
        })
    },

    updateSendLevel: (busIndex, channelIndex, value) => {
        const { buses, rollbacks } = get()
        const previous = buses
            .find(b => b.index === busIndex)?.sends
            .find(s => s.channelIndex === channelIndex)?.level
        set({
            buses: buses.map(b =>
                b.index === busIndex
                    ? {
                        ...b,
                        sends: b.sends.map(s =>
                            s.channelIndex === channelIndex ? { ...s, level: value } : s
                        )
                    }
                    : b
            ),
            rollbacks: captureRollback(rollbacks, sendLevelKey(channelIndex, busIndex), previous),
        })
    },

    updateSendOn: (busIndex, channelIndex, on) => {
        const { buses, rollbacks } = get()
        const previous = buses
            .find(b => b.index === busIndex)?.sends
            .find(s => s.channelIndex === channelIndex)?.on
        set({
            buses: buses.map(b =>
                b.index === busIndex
                    ? {
                        ...b,
                        sends: b.sends.map(s =>
                            s.channelIndex === channelIndex ? { ...s, on } : s
                        )
                    }
                    : b
            ),
            rollbacks: captureRollback(rollbacks, sendOnKey(channelIndex, busIndex), previous),
        })
    },

    updateMatrixFader: (matrixIndex, value) => {
        const { matrices, rollbacks } = get()
        set({
            matrices: matrices.map(m =>
                m.index === matrixIndex ? { ...m, fader: value } : m
            ),
            rollbacks: captureRollback(
                rollbacks,
                matrixFaderKey(matrixIndex),
                matrices.find(m => m.index === matrixIndex)?.fader,
            ),
        })
    },

    updateMatrixOn: (matrixIndex, on) => {
        const { matrices, rollbacks } = get()
        set({
            matrices: matrices.map(m =>
                m.index === matrixIndex ? { ...m, on } : m
            ),
            rollbacks: captureRollback(
                rollbacks,
                matrixOnKey(matrixIndex),
                matrices.find(m => m.index === matrixIndex)?.on,
            ),
        })
    },

    setStarredChannels: (channels) => set({ starredChannels: channels }),
    setDefaultChannels: (channels) => set({ defaultChannels: channels }),

    setConfig: (config) => {
        const { userId } = get()
        const myBusIndex = deriveMyBusIndex(config, userId)
        // Only update defaultChannels if the config actually has the field;
        // otherwise preserve current value (bridge config lacks this field)
        const { defaultChannels: current } = get()
        set({ config, myBusIndex, defaultChannels: config.defaultChannels ?? current })
    },

    /**
     * R2 — apply a bridge rejection.
     *
     * Two things happen, in this order and both synchronously: the optimistic
     * value is put back to the desk's real value (so no one is left looking at a
     * level that never existed), and the reason is recorded for the fader cue.
     * Before this, a rejection was invisible — the knob simply eased back 2s
     * later with an amber undo glyph and no words, identically for "not your
     * bus", "bridge restarting" and "you lost a race".
     */
    rejectCommand: (targetKey, reason) => {
        const state = get()
        const parsed = parseTargetKey(targetKey)
        const previous = state.rollbacks[targetKey]

        const rejections = {
            ...state.rejections,
            [targetKey]: { reason, seq: (state.rejections[targetKey]?.seq ?? 0) + 1 },
        }

        // No captured value (a snapshot already landed, or the rejection names a
        // key we never wrote) ⇒ record the reason only. The store already holds
        // the authoritative value in that case; there is nothing to undo.
        if (parsed == null || previous === undefined) {
            set({ rejections })
            return
        }

        const rollbacks = { ...state.rollbacks }
        delete rollbacks[targetKey]

        const buses = state.buses.map(b => {
            if (parsed.kind === "bus_fader" && b.index === parsed.busIndex && typeof previous === "number") {
                return { ...b, fader: previous }
            }
            if (parsed.kind === "bus_on" && b.index === parsed.busIndex && typeof previous === "boolean") {
                return { ...b, on: previous }
            }
            if (
                (parsed.kind === "send_level" || parsed.kind === "send_on") &&
                b.index === parsed.busIndex
            ) {
                return {
                    ...b,
                    sends: b.sends.map(s => {
                        if (s.channelIndex !== parsed.channelIndex) return s
                        if (parsed.kind === "send_level" && typeof previous === "number") {
                            return { ...s, level: previous }
                        }
                        if (parsed.kind === "send_on" && typeof previous === "boolean") {
                            return { ...s, on: previous }
                        }
                        return s
                    }),
                }
            }
            return b
        })

        const matrices = state.matrices.map(m => {
            if (parsed.kind === "matrix_fader" && m.index === parsed.matrixIndex && typeof previous === "number") {
                return { ...m, fader: previous }
            }
            if (parsed.kind === "matrix_on" && m.index === parsed.matrixIndex && typeof previous === "boolean") {
                return { ...m, on: previous }
            }
            return m
        })

        logger.info("[MonitorStore] Command rejected for %s: %s (rolled back)", targetKey, reason)
        set({ buses, matrices, rollbacks, rejections })
    },

    clearRejection: (targetKey) => {
        const { rejections } = get()
        if (!(targetKey in rejections)) return
        const next = { ...rejections }
        delete next[targetKey]
        set({ rejections: next })
    },

    reset: () => set({
        status: "disconnected",
        error: null,
        channels: [],
        buses: [],
        matrices: [],
        config: null,
        unconfirmed: [],
        rejections: {},
        rollbacks: {},
        myBusIndex: null,
        userId: null,
        starredChannels: [],
        defaultChannels: [],
        lastSnapshotAt: 0,
        snapshotCount: 0,
        stateUpdatedAt: null,
    }),
}))
