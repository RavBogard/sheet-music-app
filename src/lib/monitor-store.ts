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

    // Actions
    setStatus: (status: ConnectionStatus, error?: string) => void
    setSnapshot: (snapshot: MixerSnapshot, userId: string) => void
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

    setStatus: (status, error) => set({ status, error: error || null }),

    setSnapshot: (snapshot, userId) => {
        const state = get()
        
        // Stale-while-revalidate: Ignore empty/malformed snapshots if we already have valid data
        if (snapshot.buses.length === 0 && state.buses.length > 0) {
            logger.warn("[MonitorStore] Received empty snapshot, freezing last known good state")
            // Still update health tracking so we know we got a ping
            set({ lastSnapshotAt: Date.now(), snapshotCount: state.snapshotCount + 1 })
            return
        }

        const myBusIndex = snapshot.config.busAssignments
            ? findUserBus(snapshot.config.busAssignments, userId)
            : null

        const matrices = snapshot.matrices || []

        // Always update health tracking (even if data unchanged)
        const healthUpdate = {
            lastSnapshotAt: Date.now(),
            snapshotCount: state.snapshotCount + 1,
        }

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

        set({
            channels: snapshot.channels,
            buses: snapshot.buses,
            matrices,
            config: snapshot.config,
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
        const myBusIndex = userId && config.busAssignments
            ? findUserBus(config.busAssignments, userId)
            : null
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
    }),
}))
