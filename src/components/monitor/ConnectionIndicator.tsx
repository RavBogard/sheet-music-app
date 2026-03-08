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
 * Returns a human-readable bridge status message, or null if everything is fine.
 */
export function getBridgeStatusMessage(bridge?: BridgeStatus): string | null {
    if (!bridge?.lastSeen) return null
    if (!isBridgeOnline(bridge)) return "Bridge is offline"
    if (bridge.x32Connected === false) return "Bridge online \u2014 mixer disconnected"
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

    if (bridge && bridge.x32Connected === false) {
        return { label: "Mixer disconnected", color: "bg-yellow-500", isAnimated: false }
    }

    return { label: "Connected", color: "bg-green-500", isAnimated: false }
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
