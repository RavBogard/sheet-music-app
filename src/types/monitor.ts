/**
 * Monitor system types — shared between web app and bridge server.
 */

export interface MonitorConfig {
    bridgeUrl: string
    x32Address: string
    x32Port: number
    monitorBuses: number[]
    busAssignments: Record<string, BusAssignment | null>
    authorizedUsers: string[]
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

export interface MixerSnapshot {
    channels: ChannelInfo[]
    buses: BusInfo[]
    config: MonitorConfig
}

/** Messages from bridge to iPad */
export type ServerMessage =
    | { type: "state"; data: MixerSnapshot }
    | { type: "fader_update"; busIndex: number; field: "master"; value: number }
    | { type: "send_update"; busIndex: number; channelIndex: number; field: "level" | "on"; value: number | boolean }
    | { type: "config_update"; config: MonitorConfig }
    | { type: "error"; message: string }
    | { type: "auth_ok"; userId: string }

/** Messages from iPad to bridge */
export type ClientMessage =
    | { type: "auth"; token: string }
    | { type: "set_bus_master"; busIndex: number; value: number }
    | { type: "set_send_level"; busIndex: number; channelIndex: number; value: number }
    | { type: "set_send_on"; busIndex: number; channelIndex: number; value: boolean }
    | { type: "request_state" }
