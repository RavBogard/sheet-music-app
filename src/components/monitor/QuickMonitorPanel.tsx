"use client"

import { useEffect, useCallback, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore, getVisibleChannels } from "@/lib/monitor-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { getMonitorClient } from "@/hooks/use-monitor-connection"
import { VerticalFaderStrip } from "@/components/monitor/VerticalFaderStrip"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Loader2, Wifi, WifiOff, Server, ServerOff } from "lucide-react"
import { isBridgeOnline, getBridgeStatusMessage } from "@/components/monitor/ConnectionIndicator"

/**
 * Compact monitor mixer panel for the performance toolbar.
 * Shows master fader + starred/default channel sends as vertical faders.
 * Uses singleton connection -- shared with MonitorPage.
 *
 * Live mode popup: vertical faders in horizontal row, no "More Me!" macro,
 * channels filtered via getVisibleChannels (defaults + starred).
 */
export function QuickMonitorPanel() {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()

    const {
        status, channels, buses, config, myBusIndex,
        starredChannels, defaultChannels,
        setStarredChannels,
        updateBusFader, updateSendLevel, updateSendOn,
    } = useMonitorStore()

    // Load starred channels from Firestore (backward compat: pinnedChannels field)
    useEffect(() => {
        if (!user) return
        getDoc(doc(db, "users", user.uid, "preferences", "monitor")).then(snap => {
            if (snap.exists()) {
                const data = snap.data()
                const channels = data.pinnedChannels || []
                // Only set if store doesn't already have starred channels
                // (store may have been populated by configure mode)
                if (channels.length > 0) {
                    setStarredChannels(channels)
                }
            }
        }).catch(() => { })
    }, [user, setStarredChannels])

    // Fader handlers
    const handleBusMaster = useCallback((value: number) => {
        if (myBusIndex == null) return
        updateBusFader(myBusIndex, value)
        getMonitorClient()?.setBusMaster(myBusIndex, value)
    }, [myBusIndex, updateBusFader])

    const handleSendLevel = useCallback((channelIndex: number, value: number) => {
        if (myBusIndex == null) return
        updateSendLevel(myBusIndex, channelIndex, value)
        getMonitorClient()?.setSendLevel(myBusIndex, channelIndex, value)
    }, [myBusIndex, updateSendLevel])

    const handleSendOn = useCallback((channelIndex: number, on: boolean) => {
        if (myBusIndex == null) return
        updateSendOn(myBusIndex, channelIndex, on)
        getMonitorClient()?.setSendOn(myBusIndex, channelIndex, on)
    }, [myBusIndex, updateSendOn])

    // Derived state
    const myBus = buses.find(b => b.index === myBusIndex)
    const channelMap = new Map(channels.map(c => [c.index, c]))

    // Filter channels using getVisibleChannels (defaults + starred, filtered to bus sends)
    const visibleChannelIndices = getVisibleChannels(
        defaultChannels,
        starredChannels,
        myBus?.sends || []
    )
    const visibleSends = myBus?.sends.filter(s =>
        visibleChannelIndices.includes(s.channelIndex)
    ) || []

    // Not ready states
    if (!hasAccess) return null

    // Bridge heartbeat status
    const bridgeMessage = getBridgeStatusMessage(config?.bridge)
    if (bridgeMessage) {
        const isMixerOnly = bridgeMessage.includes("mixer disconnected")
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                {isMixerOnly ? <ServerOff className="w-4 h-4 text-yellow-600" /> : <ServerOff className="w-4 h-4" />}
                <span className="text-xs">{bridgeMessage}</span>
            </div>
        )
    }

    if (status === "connecting") {
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Connecting to mixer...</span>
            </div>
        )
    }

    if (status === "error" || status === "disconnected") {
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs">Mixer offline</span>
            </div>
        )
    }

    if (!myBusIndex || !myBus) {
        return (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                No monitor bus assigned
            </div>
        )
    }

    return (
        <div className="max-w-[504px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div>
                    <div className="text-sm font-semibold text-foreground truncate pr-2 max-w-[180px]">
                        {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? myBus.name : `My Monitor`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        Bus {myBusIndex} {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? "" : `\u2014 ${myBus.name}`}
                    </div>
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

            {/* Vertical faders in horizontal row */}
            <div className="flex flex-row overflow-x-auto gap-1 p-3 min-h-[280px]">
                {/* Master bus fader (leftmost) */}
                <VerticalFaderStrip
                    label={myBus.name && myBus.name !== `Bus ${myBusIndex}` ? "Master" : "Master"}
                    value={myBus.fader}
                    on={true}
                    isMaster
                    onChange={handleBusMaster}
                    onMuteToggle={() => {}}
                />

                {/* Divider between master and channels */}
                {visibleSends.length > 0 && (
                    <div className="w-px bg-brand/20 mx-1 self-stretch" />
                )}

                {/* Channel sends */}
                {visibleSends.length === 0 ? (
                    <div className="flex items-center justify-center flex-1 text-[10px] text-muted-foreground">
                        No channels starred
                    </div>
                ) : (
                    visibleSends.map(send => {
                        const ch = channelMap.get(send.channelIndex)
                        const name = ch?.name || `Ch ${send.channelIndex}`
                        return (
                            <VerticalFaderStrip
                                key={send.channelIndex}
                                label={name}
                                value={send.level}
                                on={send.on}
                                onChange={(val) => handleSendLevel(send.channelIndex, val)}
                                onMuteToggle={() => handleSendOn(send.channelIndex, !send.on)}
                            />
                        )
                    })
                )}
            </div>
        </div>
    )
}
