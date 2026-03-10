"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useMonitorStore } from "@/lib/monitor-store"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { ConnectionIndicator } from "@/components/monitor/ConnectionIndicator"
import { MatrixPanel } from "@/components/monitor/MatrixPanel"
import { BusAssignmentPanel } from "@/components/monitor/BusAssignmentPanel"
import { DefaultChannelPicker } from "@/components/monitor/DefaultChannelPicker"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Loader2, Radio, ChevronDown, ChevronUp, Star } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function MonitorPage() {
    const { user, loading: authLoading, isAdmin } = useAuth()
    const { hasAccess, isSoundEngineer, loading: accessLoading } = useMonitorAccess()
    // Sound engineers see their section open by default
    const [showEngSection, setShowEngSection] = useState(true)

    // Persistent connection -- shared with QuickMonitorPanel
    const { client } = useMonitorConnection()

    // Granular selectors — only re-render when the specific data changes
    const status = useMonitorStore(s => s.status)
    const error = useMonitorStore(s => s.error)
    const channels = useMonitorStore(s => s.channels)
    const buses = useMonitorStore(s => s.buses)
    const matrices = useMonitorStore(s => s.matrices)
    const config = useMonitorStore(s => s.config)
    const myBusIndex = useMonitorStore(s => s.myBusIndex)
    const starredChannels = useMonitorStore(s => s.starredChannels)
    const defaultChannels = useMonitorStore(s => s.defaultChannels)
    const updateBusFader = useMonitorStore(s => s.updateBusFader)
    const updateSendLevel = useMonitorStore(s => s.updateSendLevel)
    const updateSendOn = useMonitorStore(s => s.updateSendOn)
    const updateMatrixFader = useMonitorStore(s => s.updateMatrixFader)
    const updateMatrixOn = useMonitorStore(s => s.updateMatrixOn)
    const setStarredChannels = useMonitorStore(s => s.setStarredChannels)
    const setDefaultChannels = useMonitorStore(s => s.setDefaultChannels)

    // Admins or sound engineers get full controls
    const hasEngineerAccess = isSoundEngineer || isAdmin

    // Load starred channels (pinnedChannels in Firestore) and default channels on mount
    useEffect(() => {
        if (!user) return
        // Load starred channels from user preferences
        getDoc(doc(db, "users", user.uid, "preferences", "monitor")).then(snap => {
            if (snap.exists()) {
                const data = snap.data()
                setStarredChannels(data.pinnedChannels || [])
            }
        }).catch(() => { /* ignore */ })

        // Load default channels from config
        getDoc(doc(db, "config", "monitor")).then(snap => {
            if (snap.exists()) {
                const data = snap.data()
                setDefaultChannels(data.defaultChannels || [])
            }
        }).catch(() => { /* ignore */ })
    }, [user, setStarredChannels, setDefaultChannels])

    // Toggle star on a channel
    const toggleStar = useCallback(async (channelIndex: number) => {
        if (!user) return
        const next = starredChannels.includes(channelIndex)
            ? starredChannels.filter(c => c !== channelIndex)
            : [...starredChannels, channelIndex]
        setStarredChannels(next)
        // Persist to Firestore using existing pinnedChannels field name
        try {
            await setDoc(
                doc(db, "users", user.uid, "preferences", "monitor"),
                { pinnedChannels: next },
                { merge: true }
            )
        } catch { /* ignore */ }
    }, [user, starredChannels, setStarredChannels])

    // Fader handlers -- own bus
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

    // Matrix handlers -- engineers only
    const handleMatrixFader = useCallback((matrixIndex: number, value: number) => {
        updateMatrixFader(matrixIndex, value)
        client?.setMatrixFader(matrixIndex, value)
    }, [updateMatrixFader, client])

    const handleMatrixOn = useCallback((matrixIndex: number, on: boolean) => {
        updateMatrixOn(matrixIndex, on)
        client?.setMatrixOn(matrixIndex, on)
    }, [updateMatrixOn, client])

    // -- Loading --
    if (authLoading || accessLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                Sign in to access monitor controls.
            </div>
        )
    }

    if (!hasAccess) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                You don&apos;t have monitor access. Ask a sound engineer or admin to assign you a bus.
            </div>
        )
    }

    // -- Connecting / Error --
    if (status === "disconnected" || status === "connecting") {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Radio className="w-8 h-8 text-brand animate-pulse" />
                <p className="text-muted-foreground">Connecting to mixer...</p>
                <ConnectionIndicator status={status} error={error} />
            </div>
        )
    }

    if (status === "error" && !config) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <ConnectionIndicator status={status} error={error} />
                <p className="text-sm text-muted-foreground mt-2">
                    Make sure the bridge server is running on the production PC.
                </p>
            </div>
        )
    }

    // -- Engineer without a bus: engineer dashboard --
    if (config && myBusIndex === null && hasEngineerAccess) {
        return (
            <div className="max-w-lg mx-auto p-4 space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold">Sound Engineer</h1>
                    <ConnectionIndicator status={status} error={error} />
                </div>

                <p className="text-sm text-muted-foreground">
                    You do not have a personal monitor bus assigned to you.
                    Use the tools below to manage the monitor system for the band.
                </p>

                <BusAssignmentPanel config={config} />
                <DefaultChannelPicker />

                {matrices.length > 0 && (
                    <MatrixPanel
                        matrices={matrices}
                        onFaderChange={handleMatrixFader}
                        onToggle={handleMatrixOn}
                    />
                )}
            </div>
        )
    }

    // -- Main mixer view (Configure mode) --
    const myBus = buses.find(b => b.index === myBusIndex)
    if (!myBus) {
        // Only show loading on initial load — not when we had data and it temporarily disappeared
        if (buses.length === 0) {
            return (
                <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                    Waiting for mixer data...
                </div>
            )
        }
        // Bus index mismatch (stale state during config update) — show spinner briefly
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // Show ALL channel sends for the user's bus (configure mode = full channel list)
    const allSends = Array.isArray(myBus.sends) ? myBus.sends : []
    const channelMap = new Map((Array.isArray(channels) ? channels : []).map(c => [c.index, c]))

    return (
        <div className="max-w-lg mx-auto p-4 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold truncate pr-4">
                    {myBus.name && myBus.name !== `Bus ${myBusIndex}` ? myBus.name : "My Monitor"}
                </h1>
                <ConnectionIndicator status={status} error={error} />
            </div>
            <p className="text-sm text-muted-foreground mb-6">
                Bus {myBusIndex}
            </p>

            {/* Master fader */}
            <div className="bg-card border border-brand/10 rounded-xl p-4 mb-4">
                <FaderStrip
                    label="Master"
                    value={myBus.fader}
                    on={true}
                    isMaster
                    onChange={handleBusMaster}
                />
            </div>

            {/* Channel sends -- all channels with star toggle */}
            <div className="bg-card border border-brand/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-medium text-muted-foreground">Channels</h2>
                    <p className="text-xs text-muted-foreground">
                        Tap <Star className="w-3 h-3 inline text-yellow-500" /> to add to your live mix
                    </p>
                </div>
                <div className="space-y-1">
                    {allSends.map(send => {
                        const ch = channelMap.get(send.channelIndex)
                        const name = ch?.name || `Ch ${send.channelIndex}`
                        const isStarred = starredChannels.includes(send.channelIndex)
                        const isDefault = defaultChannels.includes(send.channelIndex)
                        return (
                            <div key={send.channelIndex} className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleStar(send.channelIndex)}
                                    className={
                                        isStarred
                                            ? "text-yellow-500"
                                            : "text-zinc-700 hover:text-zinc-500"
                                    }
                                    title={isStarred ? "Remove from live mix" : "Add to live mix"}
                                >
                                    <Star className="w-4 h-4" fill={isStarred ? "currentColor" : "none"} />
                                </Button>
                                <div className="flex-1 min-w-0">
                                    <FaderStrip
                                        label={name}
                                        value={send.level}
                                        on={send.on}
                                        onChange={(val) => handleSendLevel(send.channelIndex, val)}
                                        onUnmuteCheck={() => handleSendOn(send.channelIndex, true)}
                                    />
                                </div>
                                {isDefault && (
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-brand/20 text-brand border border-brand/20">
                                        default
                                    </span>
                                )}
                            </div>
                        )
                    })}
                    {allSends.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No channels routed to this bus yet.
                        </p>
                    )}
                </div>
            </div>

            {/* Sound Engineer Section -- collapsible, open by default */}
            {hasEngineerAccess && (
                <div className="mt-4 space-y-4">
                    <Button
                        variant="ghost"
                        onClick={() => setShowEngSection(!showEngSection)}
                        className="flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-400 w-full justify-start"
                    >
                        {showEngSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Sound Engineer
                    </Button>

                    {showEngSection && (
                        <div className="space-y-4">
                            <BusAssignmentPanel config={config!} />
                            <DefaultChannelPicker />
                            <MatrixPanel
                                matrices={matrices}
                                onFaderChange={handleMatrixFader}
                                onToggle={handleMatrixOn}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
