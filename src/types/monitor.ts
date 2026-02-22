/**
 * Monitor system types — shared between web app and bridge server.
 *
 * ⚠️  CANONICAL SOURCE — bridge/src/types.ts mirrors this file.
 * Run `npm run check:types` to verify sync, or `npm run check:types -- --fix` to copy.
 */

export interface MonitorConfig {
    bridgeUrl: string
    x32Address: string
    x32Port: number
    monitorBuses: number[]
    busAssignments: Record<string, BusAssignment | null>
    bridge?: BridgeStatus
}

export interface BridgeStatus {
    status: "online" | "offline"
    lastSeen: unknown // Firestore Timestamp
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
    | { type: "set_send_level"; busIndex: number; channelIndex: number; value: number }
    | { type: "set_send_on"; busIndex: number; channelIndex: number; value: boolean }
    | { type: "set_matrix_fader"; matrixIndex: number; value: number }
    | { type: "set_matrix_on"; matrixIndex: number; value: boolean }
    | { type: "request_state" }
