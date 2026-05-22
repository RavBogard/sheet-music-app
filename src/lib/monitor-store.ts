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
    updateSendLevel: (busIndex: number, channelIndex: number, value: number) => void
    updateSendOn: (busIndex: number, channelIndex: number, on: boolean) => void
    updateMatrixFader: (matrixIndex: number, value: number) => void
    updateMatrixOn: (matrixIndex: number, on: boolean) => void
    setStarredChannels: (channels: number[]) => void
    setDefaultChannels: (channels: number[]) => void
    setConfig: (config: MonitorConfig) => void
    reset: () => void
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
    status: "disconnected",
    error: null,
    channels: [],
    buses: [],
    matrices: [],
    config: null,
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
        const healthUpdate = {
            lastSnapshotAt: Date.now(),
            snapshotCount: state.snapshotCount + 1,
            stateUpdatedAt,
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

        // Shallow equality check — skip store update if nothing changed
        const channelsSame = shallowEqualArray(state.channels, snapshot.channels)
        const busesSame = shallowEqualArray(state.buses, snapshot.buses)
        const matricesSame = shallowEqualArray(state.matrices, matrices)
        const busIndexSame = state.myBusIndex === myBusIndex

        if (channelsSame && busesSame && matricesSame && busIndexSame) {
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
            myBusIndex,
            userId,
            ...healthUpdate,
        })
    },

    updateBusFader: (busIndex, value) => {
        const { buses } = get()
        set({
            buses: buses.map(b =>
                b.index === busIndex ? { ...b, fader: value } : b
            )
        })
    },

    updateSendLevel: (busIndex, channelIndex, value) => {
        const { buses } = get()
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
            )
        })
    },

    updateSendOn: (busIndex, channelIndex, on) => {
        const { buses } = get()
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
            )
        })
    },

    updateMatrixFader: (matrixIndex, value) => {
        const { matrices } = get()
        set({
            matrices: matrices.map(m =>
                m.index === matrixIndex ? { ...m, fader: value } : m
            )
        })
    },

    updateMatrixOn: (matrixIndex, on) => {
        const { matrices } = get()
        set({
            matrices: matrices.map(m =>
                m.index === matrixIndex ? { ...m, on } : m
            )
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

    reset: () => set({
        status: "disconnected",
        error: null,
        channels: [],
        buses: [],
        matrices: [],
        config: null,
        myBusIndex: null,
        userId: null,
        starredChannels: [],
        defaultChannels: [],
        lastSnapshotAt: 0,
        snapshotCount: 0,
        stateUpdatedAt: null,
    }),
}))
