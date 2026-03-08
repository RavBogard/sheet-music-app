"use client"

import { useEffect, useCallback, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore } from "@/lib/monitor-store"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { getMonitorClient } from "@/hooks/use-monitor-connection"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Loader2, Star, Wifi, WifiOff, Server, ServerOff, PlusCircle } from "lucide-react"
import { isBridgeOnline, getBridgeStatusMessage } from "@/components/monitor/ConnectionIndicator"

/**
 * Compact monitor mixer panel for the performance toolbar.
 * Shows master fader + active/pinned channel sends.
 * Uses singleton connection — shared with MonitorPage.
 */
export function QuickMonitorPanel() {
    const { user } = useAuth()
    const { hasAccess } = useMonitorAccess()
    const [pinnedChannels, setPinnedChannels] = useState<number[]>([])

    const {
        status, channels, buses, config, myBusIndex,
        updateBusFader, updateSendLevel, updateSendOn,
    } = useMonitorStore()

    // Load pinned channels from Firestore
    useEffect(() => {
        if (!user) return
        getDoc(doc(db, "users", user.uid, "preferences", "monitor")).then(snap => {
            if (snap.exists()) setPinnedChannels(snap.data().pinnedChannels || [])
        }).catch(() => { })

    }, [user])

    // Save pinned channels
    const togglePin = useCallback(async (channelIndex: number) => {
        if (!user) return
        setPinnedChannels(prev => {
            const next = prev.includes(channelIndex)
                ? prev.filter(c => c !== channelIndex)
                : [...prev, channelIndex]
            setDoc(doc(db, "users", user.uid, "preferences", "monitor"), { pinnedChannels: next }, { merge: true }).catch(() => { })
            return next
        })

    }, [user])

    // Fader handlers
    const handleBusMaster = useCallback((value: number) => {
        if (!myBusIndex) return
        updateBusFader(myBusIndex, value)
        getMonitorClient()?.setBusMaster(myBusIndex, value)
    }, [myBusIndex, updateBusFader])

    const handleSendLevel = useCallback((channelIndex: number, value: number) => {
        if (!myBusIndex) return
        updateSendLevel(myBusIndex, channelIndex, value)
        getMonitorClient()?.setSendLevel(myBusIndex, channelIndex, value)
    }, [myBusIndex, updateSendLevel])

    const handleSendOn = useCallback((channelIndex: number, on: boolean) => {
        if (!myBusIndex) return
        updateSendOn(myBusIndex, channelIndex, on)
        getMonitorClient()?.setSendOn(myBusIndex, channelIndex, on)
    }, [myBusIndex, updateSendOn])

    // Derived state
    const myBus = buses.find(b => b.index === myBusIndex)
    const channelMap = new Map(channels.map(c => [c.index, c]))

    // Find "Me" channel - simple heuristic: channel name matches bus name, or bus name matches part of channel name
    const myChannelSend = myBus?.sends.find(s => {
        const ch = channelMap.get(s.channelIndex);
        if (!ch || !ch.name || !myBus.name) return false;
        const busName = myBus.name.toLowerCase();
        const chName = ch.name.toLowerCase();
        return chName === busName ||
            chName.includes(busName) ||
            (busName.includes("vox") && chName.includes("vox") && busName.split(' ')[0] === chName.split(' ')[0]);
    });

    // "More Me" Macro: Increases my channel up to 10% (max 100%), lowers all other active sends by 5%
    const handleMoreMe = useCallback(() => {
        if (!myBusIndex || !myBus || !myChannelSend) return;

        const currentMeLevel = myChannelSend.level;
        const newMeLevel = Math.min(1.0, currentMeLevel + 0.10);

        // Optimistically apply local, then send
        updateSendLevel(myBusIndex, myChannelSend.channelIndex, newMeLevel);
        getMonitorClient()?.setSendLevel(myBusIndex, myChannelSend.channelIndex, newMeLevel);

        // Lower everything else slightly to create space
        myBus.sends.forEach(send => {
            if (send.channelIndex !== myChannelSend.channelIndex && send.level > 0.05) {
                const newLevel = Math.max(0.01, send.level - 0.05);
                updateSendLevel(myBusIndex, send.channelIndex, newLevel);
                getMonitorClient()?.setSendLevel(myBusIndex, send.channelIndex, newLevel);
            }
        });
    }, [myBusIndex, myBus, myChannelSend, updateSendLevel]);

    // Show active channels (non-zero level) + pinned channels
    const visibleSends = myBus?.sends.filter(s =>
        s.on || s.level > 0.001 || pinnedChannels.includes(s.channelIndex)
    ) || []

    // Not ready states
    if (!hasAccess) return null

    // Bridge heartbeat status
    const bridgeMessage = getBridgeStatusMessage(config?.bridge)
    if (bridgeMessage) {
        const isMixerOnly = bridgeMessage.includes("mixer disconnected")
        return (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-500">
                {isMixerOnly ? <ServerOff className="w-4 h-4 text-yellow-600" /> : <ServerOff className="w-4 h-4" />}
                <span className="text-xs">{bridgeMessage}</span>
            </div>
        )
    }

    if (status === "connecting") {
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
                    <div className="text-sm font-semibold text-zinc-200 truncate pr-2 max-w-[180px]">
                        {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? myBus.name : `My Monitor`}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                        Bus {myBusIndex} {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? "" : `— ${myBus.name}`}
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

            {/* Master */}
            <div className="px-3 pb-1">
                <FaderStrip
                    label={myBus.name && myBus.name !== `Bus ${myBusIndex}` ? `🔊 ${myBus.name} Master` : "🔊 Master"}
                    value={myBus.fader}
                    on={true}
                    isMaster
                    onChange={handleBusMaster}
                />
            </div>

            {/* "More Me" Macro Button (only if we found a matching channel) */}
            {myChannelSend && (
                <div className="px-3 py-1">
                    <button
                        onClick={handleMoreMe}
                        className="w-full py-2 bg-violet-900/40 hover:bg-violet-800/60 border border-violet-500/30 rounded-lg flex items-center justify-center gap-2 text-violet-200 text-xs font-semibold transition-colors active:scale-[0.98]"
                    >
                        <PlusCircle className="w-4 h-4" />
                        More Me!
                    </button>
                </div>
            )}

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
                                    className={`shrink-0 p-1 rounded transition-colors ${isPinned ? "text-yellow-500" : "text-zinc-700 hover:text-zinc-500"
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
                                        onUnmuteCheck={() => handleSendOn(send.channelIndex, true)}
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
