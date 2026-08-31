"use client"

import { ConnectionStatus } from "@/lib/firestore-monitor-client"
import { BridgeStatus } from "@/types/monitor"
import { Loader2 } from "lucide-react"
import { ReactNode } from "react"

// ─── Shared helpers (exported for reuse by QuickMonitorPanel, etc.) ───

/**
 * Check if the bridge heartbeat indicates it's online.
 * Considers staleness: if lastSeen > 2 minutes ago, treat as offline.
 */
export function isBridgeOnline(bridge?: BridgeStatus): boolean {
    if (!bridge?.lastSeen) return true // No heartbeat data = legacy bridge, assume online
    if (bridge.status === "offline") return false

    let lastSeen: Date
    try {
        const ts = bridge.lastSeen as { toDate?: () => Date; seconds?: number }
        if (ts.toDate) lastSeen = ts.toDate()
        else if (ts.seconds) lastSeen = new Date(ts.seconds * 1000)
        else lastSeen = new Date(bridge.lastSeen as string)
    } catch {
        return true
    }

    const ageMs = Date.now() - lastSeen.getTime()
    return ageMs < 120_000
}

/**
 * R7 \u2014 is the MIXER itself unreachable, as opposed to the state pipeline being
 * wedged?
 *
 * The bridge publishes `x32Connected` FOLDED: `socketAlive && stateAgeMs < 30s`.
 * That fold is right for a status light (it refuses to show green over dead
 * writes) and catastrophically wrong as a permission to disable faders \u2014 a
 * Firestore write stall on congested venue WiFi flips it false while the OSC
 * socket, and therefore the entire command path, is perfectly healthy.
 *
 * `socketAlive` is the raw, unfolded bit (bridge v10.0.4+) and is the only
 * honest answer to "can a command still reach the desk?". Older bridges don't
 * publish it, so we fall back to the folded bit for them \u2014 the previous
 * behaviour, preserved deliberately rather than assuming reachability we cannot
 * observe.
 */
export function isMixerUnreachable(bridge?: BridgeStatus): boolean {
    if (!bridge) return false
    if (typeof bridge.socketAlive === "boolean") return !bridge.socketAlive
    return bridge.x32Connected === false
}

/**
 * R7 \u2014 the bridge and the desk are both fine, but the state pipeline is behind
 * (folded `x32Connected` false while `socketAlive` is true). Faders MUST stay
 * live here; this drives a quiet "Syncing\u2026" hint instead.
 */
export function isStateSyncing(bridge?: BridgeStatus): boolean {
    if (!bridge) return false
    if (bridge.socketAlive !== true) return false // unknown or dead socket \u2192 not this case
    return bridge.x32Connected === false
}

/**
 * Returns a human-readable bridge status message, or null if everything is fine.
 *
 * R7: a syncing state pipeline deliberately returns null. `QuickMonitorPanel`
 * uses this message as an EARLY RETURN \u2014 a non-null value replaces the whole
 * fader panel with a line of text \u2014 so returning "mixer disconnected" during a
 * Firestore stall took every fader off a musician's screen on a healthy desk.
 */
export function getBridgeStatusMessage(bridge?: BridgeStatus): string | null {
    if (!bridge?.lastSeen) return null
    if (!isBridgeOnline(bridge)) return "Bridge is offline"
    if (isMixerUnreachable(bridge)) return "Bridge online \u2014 mixer disconnected"
    return null
}

// ─── Display state computation ───

export interface ConnectionDisplayState {
    label: string
    color: string
    isAnimated: boolean
}

/**
 * Compute the display state for the connection indicator.
 * Differentiates between bridge/mixer/connection states.
 */
export function getConnectionDisplayState(
    status: ConnectionStatus,
    bridge?: BridgeStatus,
): ConnectionDisplayState {
    // Firestore-level disconnected or error states take precedence
    if (status === "disconnected" || status === "error") {
        return { label: "Offline", color: "bg-gray-400", isAnimated: false }
    }

    if (status === "connecting") {
        return { label: "Connecting...", color: "bg-yellow-500", isAnimated: true }
    }

    // status === "connected" -- check bridge health
    if (bridge && !isBridgeOnline(bridge)) {
        return { label: "Bridge offline", color: "bg-red-500", isAnimated: false }
    }

    if (bridge && isMixerUnreachable(bridge)) {
        return { label: "Mixer disconnected", color: "bg-yellow-500", isAnimated: false }
    }

    // R7: state pipeline behind, control path fine. Named distinctly so nobody
    // reads "Mixer disconnected" off a desk that is answering commands.
    if (bridge && isStateSyncing(bridge)) {
        return { label: "Syncing…", color: "bg-yellow-500", isAnimated: false }
    }

    return { label: "Connected", color: "bg-green-500", isAnimated: false }
}

/**
 * Whether the mixer is unreachable for *control* — the condition under which
 * faders should be wrapped in `DisconnectedOverlay` ("last known levels",
 * interaction disabled). This is the HARD-offline signal: the Firestore
 * transport is down/errored, the bridge heartbeat is offline, or the bridge is
 * up but the X32 is disconnected.
 *
 * A merely *stale* (idle-frozen) desk is deliberately NOT "offline" here — its
 * control path still works, so blocking interaction would wrongly stop a
 * musician on a healthy-but-idle desk. Staleness is surfaced non-blockingly via
 * the per-fader cue + Live/Stale badge (see `useMonitorStaleness`).
 *
 * R7 (2026-08-31): that reasoning was written here and then bypassed one line
 * later, because the last condition read the FOLDED `x32Connected`
 * (`socketAlive && stateAgeMs < 30s`). A >30s Firestore write stall therefore
 * did exactly what the paragraph above forbids: `pointer-events-none` over every
 * fader, "Mixer offline — last known levels", mid-service, on a desk that was
 * answering commands the whole time. The gate now asks the only question that
 * justifies taking control away — is the OSC socket down — and routes a wedged
 * state pipeline to the non-blocking Syncing hint instead.
 */
export function isMixerOffline(status: ConnectionStatus, bridge?: BridgeStatus): boolean {
    if (status === "disconnected" || status === "error") return true
    if (!bridge) return false
    if (!isBridgeOnline(bridge)) return true
    return isMixerUnreachable(bridge)
}

// ─── ConnectionIndicator component ───

interface ConnectionIndicatorProps {
    status: ConnectionStatus
    bridgeStatus?: BridgeStatus
    error?: string | null
}

export function ConnectionIndicator({ status, bridgeStatus, error }: ConnectionIndicatorProps) {
    const display = getConnectionDisplayState(status, bridgeStatus)

    return (
        <div className="flex items-center gap-2 text-xs text-zinc-300">
            {display.isAnimated ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500" />
            ) : (
                <span className={`w-2 h-2 rounded-full ${display.color} shrink-0`} />
            )}
            <span>{error || display.label}</span>
        </div>
    )
}

// ─── DisconnectedOverlay component ───

interface DisconnectedOverlayProps {
    active: boolean
    children: ReactNode
}

/**
 * Wraps fader containers when offline:
 * - Reduces opacity
 * - Disables pointer events
 * - Shows "Mixer offline -- last known levels" message
 */
export function DisconnectedOverlay({ active, children }: DisconnectedOverlayProps) {
    if (!active) {
        return <>{children}</>
    }

    return (
        <div className="relative">
            <div className="opacity-50 pointer-events-none">
                {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-yellow-500 bg-zinc-900/80 px-3 py-1.5 rounded-md">
                    Mixer offline &mdash; last known levels
                </span>
            </div>
        </div>
    )
}
