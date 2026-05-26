/**
 * Monitor system types — shared between web app and bridge server.
 *
 * ⚠️  CANONICAL SOURCE — bridge/src/types.ts mirrors this file.
 * Run `npm run check:types` to verify sync, or `npm run check:types -- --fix` to copy.
 */

import { FirestoreDate } from "@/types/models"

export interface MonitorConfig {
    bridgeUrl: string
    x32Address: string
    x32Port: number
    monitorBuses: number[]
    busAssignments: Record<string, BusAssignment | BusAssignment[] | null>
    bridge?: BridgeStatus
    defaultChannels?: number[]
}

export interface BridgeStatus {
    status: "online" | "offline"
    lastSeen: FirestoreDate | null
    x32Connected: boolean
    clients: number
    localIp: string | null
    version: string
}

export interface BusAssignment {
    userId: string
    userName: string
}

export interface ChannelInfo {
    index: number
    name: string
    color: number
}

export interface BusInfo {
    index: number
    name: string
    fader: number
    /**
     * Bus master mute (X32 `/bus/MM/mix/on`; true = unmuted, mirrors `BusSend.on`
     * and `MatrixInfo.on`). Optional for back-compat with snapshots written by
     * pre-v10.0.7 bridges that didn't read this slot — consumers default to
     * `true` (unmuted, the conservative reading) when absent.
     */
    on?: boolean
    sends: BusSend[]
}

export interface BusSend {
    channelIndex: number
    level: number
    on: boolean
}

/** X32 Matrix Output (1–6) */
export interface MatrixInfo {
    index: number       // 1-6
    name: string
    fader: number       // 0.0–1.0
    on: boolean         // mute state (true = unmuted)
}

export interface MixerSnapshot {
    channels: ChannelInfo[]
    buses: BusInfo[]
    matrices?: MatrixInfo[]  // Optional — bridge v2+ only
    config: MonitorConfig
}



/** Messages from iPad to bridge */
export type ClientMessage =
    | { type: "auth"; token: string }
    | { type: "set_bus_master"; busIndex: number; value: number }
    | { type: "set_bus_on"; busIndex: number; value: boolean }
    | { type: "set_send_level"; busIndex: number; channelIndex: number; value: number }
    | { type: "set_send_on"; busIndex: number; channelIndex: number; value: boolean }
    | { type: "set_matrix_fader"; matrixIndex: number; value: number }
    | { type: "set_matrix_on"; matrixIndex: number; value: boolean }
    | { type: "request_state" }
