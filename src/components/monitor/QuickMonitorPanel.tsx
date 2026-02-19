"use client"

import { useEffect, useCallback, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore } from "@/lib/monitor-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { MonitorConfig, BridgeStatus } from "@/types/monitor"
import { Loader2, Star, Wifi, WifiOff, Server, ServerOff } from "lucide-react"

/**
 * Check if the bridge heartbeat indicates it's online.
 * Considers staleness: if lastSeen > 2 minutes ago, treat as offline.
 */
function isBridgeOnline(bridge?: BridgeStatus): boolean {
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

function getBridgeStatusMessage(bridge?: BridgeStatus): string | null {
    if (!bridge?.lastSeen) return null
    if (!isBridgeOnline(bridge)) return "Bridge is offline"
    if (bridge.x32Connected === false) return "Bridge online — mixer disconnected"
    return null
}

/**
 * Compact monitor mixer panel for the performance toolbar.
 * Shows master fader + active/pinned channel sends.
 * Uses singleton connection — shared with MonitorPage.
 */
export function QuickMonitorPanel() {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()
    const [pinnedChannels, setPinnedChannels] = useState<number[]>([])

    // Fix #9: Singleton connection — no duplicate WebSockets
    const { client } = useMonitorConnection()

    const {
        status, channels, buses, config, myBusIndex,
        updateBusFader, updateSendLevel, updateSendOn,
    } = useMonitorStore()

    // Load pinned channels from Firestore
    useEffect(() => {
        if (!user) return
        getDoc(doc(db, "users", user.uid, "preferences", "monitor")).then(snap => {
            if (snap.exists()) setPinnedChannels(snap.data().pinnedChannels || [])
        }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])

    // Save pinned channels
    const togglePin = useCallback(async (channelIndex: number) => {
        if (!user) return
        setPinnedChannels(prev => {
            const next = prev.includes(channelIndex)
                ? prev.filter(c => c !== channelIndex)
                : [...prev, channelIndex]
            setDoc(doc(db, "users", user.uid, "preferences", "monitor"), { pinnedChannels: next }, { merge: true }).catch(() => {})
            return next
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])

    // Fader handlers
    const handleBusMaster = useCallback((value: number) => {
        if (!myBusIndex) return
        updateBusFader(myBusIndex, value)
        client?.setBusMaster(myBusIndex, value)
    }, [myBusIndex, updateBusFader, client])

    const handleSendLevel = useCallback((channelIndex: number, value: number) => {
        if (!myBusIndex) return
        updateSendLevel(myBusIndex, channelIndex, value)
        client?.setSendLevel(myBusIndex, channelIndex, value)
    }, [myBusIndex, updateSendLevel, client])

    const handleSendOn = useCallback((channelIndex: number, on: boolean) => {
        if (!myBusIndex) return
        updateSendOn(myBusIndex, channelIndex, on)
        client?.setSendOn(myBusIndex, channelIndex, on)
    }, [myBusIndex, updateSendOn, client])

    // Derived state
    const myBus = buses.find(b => b.index === myBusIndex)
    const channelMap = new Map(channels.map(c => [c.index, c]))

    // Show active channels (non-zero level) + pinned channels
    const visibleSends = myBus?.sends.filter(s =>
        s.on || s.level > 0.001 || pinnedChannels.includes(s.channelIndex)
    ) || []

    // Not ready states
    if (!hasAccess || !config?.bridgeUrl) return null

    // Bridge heartbeat status
    const bridgeMessage = getBridgeStatusMessage(config.bridge)
    if (bridgeMessage) {
        const isMixerOnly = bridgeMessage.includes("mixer disconnected")
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-500">
                {isMixerOnly ? <ServerOff className="w-4 h-4 text-yellow-600" /> : <ServerOff className="w-4 h-4" />}
                <span className="text-xs">{bridgeMessage}</span>
            </div>
        )
    }

    if (status === "connecting" || status === "authenticating") {
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Connecting to mixer...</span>
            </div>
        )
    }

    if (status === "error" || status === "disconnected") {
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-500">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs">Mixer offline</span>
            </div>
        )
    }

    if (!myBusIndex || !myBus) {
        return (
            <div className="flex items-center justify-center py-6 text-zinc-500 text-xs">
                No monitor bus assigned
            </div>
        )
    }

    return (
        <div className="w-80 max-h-[60vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div>
                    <div className="text-sm font-semibold text-zinc-200">My Monitor</div>
                    <div className="text-[10px] text-zinc-500">{myBus.name} — Bus {myBusIndex}</div>
                </div>
                <div className="flex items-center gap-1.5">
                    {config?.bridge?.x32Connected === false ? (
                        <>
                            <Server className="w-3 h-3 text-yellow-500" />
                            <span className="text-[10px] text-yellow-500">No mixer</span>
                        </>
                    ) : (
                        <>
                            <Wifi className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] text-green-500">Live</span>
                        </>
                    )}
                </div>
            </div>

            {/* Master */}
            <div className="px-3 pb-1">
                <FaderStrip
                    label="🔊 Master"
                    value={myBus.fader}
                    on={true}
                    isMaster
                    onChange={handleBusMaster}
                />
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-800 mx-3 my-1" />

            {/* Channel sends */}
            <div className="px-3 pb-3 space-y-0.5">
                {visibleSends.length === 0 ? (
                    <p className="text-[10px] text-zinc-600 text-center py-3">No active channels</p>
                ) : (
                    visibleSends.map(send => {
                        const ch = channelMap.get(send.channelIndex)
                        const name = ch?.name || `Ch ${send.channelIndex}`
                        const isPinned = pinnedChannels.includes(send.channelIndex)
                        return (
                            <div key={send.channelIndex} className="flex items-center gap-1">
                                <button
                                    onClick={() => togglePin(send.channelIndex)}
                                    className={`shrink-0 p-1 rounded transition-colors ${
                                        isPinned ? "text-yellow-500" : "text-zinc-700 hover:text-zinc-500"
                                    }`}
                                    title={isPinned ? "Unpin" : "Pin (always show)"}
                                >
                                    <Star className="w-3 h-3" fill={isPinned ? "currentColor" : "none"} />
                                </button>
                                <div className="flex-1 min-w-0">
                                    <FaderStrip
                                        label={name}
                                        value={send.level}
                                        on={send.on}
                                        onChange={(val) => handleSendLevel(send.channelIndex, val)}
                                        onToggle={(on) => handleSendOn(send.channelIndex, on)}
                                    />
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
