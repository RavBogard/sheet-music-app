/**
 * Shared types between bridge server and web app.
 * 
 * These types define the WebSocket protocol and Firestore config shape.
 */

// ─── Firestore Config (stored at config/monitor) ───

export interface MonitorConfig {
    bridgeUrl: string            // ws://192.168.1.50:9000
    x32Address: string           // 192.168.1.100
    x32Port: number              // 10023 (default)
    monitorBuses: number[]       // [1, 2, 3, 4] — which buses are monitor sends
    busAssignments: Record<string, BusAssignment | null>  // "1" → { userId, userName }
    authorizedUsers: string[]    // UIDs allowed to see Monitor tab
}

export interface BusAssignment {
    userId: string
    userName: string
}

// ─── X32 State (maintained by bridge) ───

export interface X32State {
    channels: ChannelInfo[]
    buses: BusInfo[]
}

export interface ChannelInfo {
    index: number      // 1-32
    name: string       // e.g., "Daniel Gtr"
    color: number      // X32 color index
}

export interface BusInfo {
    index: number      // 1-16
    name: string       // e.g., "Wedge L"
    fader: number      // 0.0 – 1.0 (master level)
    sends: BusSend[]   // Per-channel send levels
}

export interface BusSend {
    channelIndex: number  // 1-32
    level: number         // 0.0 – 1.0
    on: boolean           // Send enabled/disabled
}

// ─── WebSocket Messages (iPad ↔ Bridge) ───

/** Messages sent FROM bridge TO iPad */
export type ServerMessage =
    | { type: "state"; data: MixerSnapshot }
    | { type: "fader_update"; busIndex: number; field: "master"; value: number }
    | { type: "send_update"; busIndex: number; channelIndex: number; field: "level" | "on"; value: number | boolean }
    | { type: "config_update"; config: MonitorConfig }
    | { type: "error"; message: string }
    | { type: "auth_ok"; userId: string }

/** Messages sent FROM iPad TO bridge */
export type ClientMessage =
    | { type: "auth"; token: string }
    | { type: "set_bus_master"; busIndex: number; value: number }
    | { type: "set_send_level"; busIndex: number; channelIndex: number; value: number }
    | { type: "set_send_on"; busIndex: number; channelIndex: number; value: boolean }
    | { type: "request_state" }

/** Snapshot of mixer state sent on connect */
export interface MixerSnapshot {
    channels: ChannelInfo[]
    buses: BusInfo[]
    config: MonitorConfig
}
