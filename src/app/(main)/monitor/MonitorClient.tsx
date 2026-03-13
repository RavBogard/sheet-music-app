"use client"

import { useCallback, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useMonitorStore } from "@/lib/monitor-store"
import { ConnectionIndicator } from "@/components/monitor/ConnectionIndicator"
import { MonitorTabs } from "@/components/monitor/MonitorTabs"
import { MatrixPanel } from "@/components/monitor/MatrixPanel"
import { BusAssignmentPanel } from "@/components/monitor/BusAssignmentPanel"
import { DefaultChannelPicker } from "@/components/monitor/DefaultChannelPicker"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Loader2, Radio } from "lucide-react"

export default function MonitorClient() {
    const { user, loading: authLoading, isAdmin } = useAuth()
    const { hasAccess, isSoundEngineer, loading: accessLoading } = useMonitorAccess()

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

    // -- Main mixer view (Tabbed mode) --
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

    const allSends = Array.isArray(myBus.sends) ? myBus.sends : []

    return (
        <MonitorTabs
            myBus={myBus}
            channels={Array.isArray(channels) ? channels : []}
            allSends={allSends}
            starredChannels={starredChannels}
            defaultChannels={defaultChannels}
            hasEngineerAccess={hasEngineerAccess}
            config={config}
            matrices={matrices}
            status={status}
            error={error}
            onBusMaster={handleBusMaster}
            onSendLevel={handleSendLevel}
            onSendOn={handleSendOn}
            onMatrixFader={handleMatrixFader}
            onMatrixOn={handleMatrixOn}
            onToggleStar={toggleStar}
        />
    )
}
