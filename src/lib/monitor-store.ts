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
    BusInfo,
    BusSend,
    MatrixInfo,
    MixerSnapshot,
} from "@/types/monitor"

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

    setStatus: (status, error) => set({ status, error: error || null }),

    setSnapshot: (snapshot, userId) => {
        // Find the user's assigned bus
        let myBusIndex: number | null = null
        if (snapshot.config.busAssignments) {
            for (const [busStr, assignment] of Object.entries(snapshot.config.busAssignments)) {
                if (assignment && assignment.userId === userId) {
                    myBusIndex = parseInt(busStr)
                    break
                }
            }
        }

        set({
            channels: snapshot.channels,
            buses: snapshot.buses,
            matrices: snapshot.matrices || [],
            config: snapshot.config,
            myBusIndex,
            userId,
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
        let myBusIndex: number | null = null
        if (userId && config.busAssignments) {
            for (const [busStr, assignment] of Object.entries(config.busAssignments)) {
                if (assignment && assignment.userId === userId) {
                    myBusIndex = parseInt(busStr)
                    break
                }
            }
        }
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
    }),
}))
