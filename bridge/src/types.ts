/**
 * Shared types between bridge server and web app.
 *
 * ⚠️  MIRROR — canonical source is src/types/monitor.ts in the main app.
 * Run `npm run check:types` from the repo root to verify sync.
 *
 * These types define the WebSocket protocol and Firestore config shape.
 */

/**
 * Mirror of `FirestoreDate` from the app's `@/types/models`. Inlined here
 * because the bridge is a standalone package and can't import the app's `@`
 * path alias. Bridge-only (the canonical monitor.ts imports this name rather
 * than declaring it), so `check:types` ignores it.
 */
type FirestoreDate =
    | string
    | Date
    | number
    | { seconds: number; nanoseconds?: number; toDate?: () => Date }
    | { toDate: () => Date }

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

// ─── Bridge-only types (not in canonical source) ───

export interface X32State {
    channels: ChannelInfo[]
    buses: BusInfo[]
    matrices: MatrixInfo[]
}

/**
 * Remote bridge control & diagnostics channel (v10.0.4 — R1). An admin writes
 * this to `config/monitor.bridgeControl` (via the app / Firebase MCP); the
 * bridge's EXISTING config-snapshot listener picks it up, dispatches by
 * `action`, and dedups by `nonce` (a nonce it already ran is ignored). This is
 * the only remote lever for a box that is ON but physically unreachable.
 *
 *   - resync    — re-read the desk + re-publish state (no socket churn). Safest.
 *   - reconnect — drop + re-establish the X32 socket (recovers a wedged socket).
 *   - restart   — relaunch the bridge process (last resort; brief outage).
 *   - selftest  — write a fresh diagnostic snapshot to monitor-live/diag/selftest.
 *
 * Bridge-only: not part of the canonical app↔bridge MonitorConfig contract, so
 * it is read off the live config doc via a cast rather than widening MonitorConfig.
 */
export interface BridgeControl {
    action: "resync" | "reconnect" | "restart" | "selftest"
    nonce: string
    requestedAt?: FirestoreDate
    requestedBy?: string
}
