"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorStore } from "@/lib/monitor-store"
import { X32WSClient } from "@/lib/x32-ws-client"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { BusSelector } from "@/components/monitor/BusSelector"
import { ConnectionIndicator } from "@/components/monitor/ConnectionIndicator"
import { MatrixPanel } from "@/components/monitor/MatrixPanel"
import { BusAssignmentPanel } from "@/components/monitor/BusAssignmentPanel"
import { MonitorConfig } from "@/types/monitor"
import { Loader2, Radio, ChevronDown, ChevronUp } from "lucide-react"
import { logger } from "@/lib/logger"

export default function MonitorPage() {
    const { user, loading: authLoading } = useAuth()
    const { hasAccess, isSoundEngineer, loading: accessLoading } = useMonitorAccess()
    const wsRef = useRef<X32WSClient | null>(null)
    const [showEngSection, setShowEngSection] = useState(false)

    const {
        status,
        error,
        channels,
        buses,
        matrices,
        config,
        myBusIndex,
        userId,
        setStatus,
        setSnapshot,
        updateBusFader,
        updateSendLevel,
        updateSendOn,
        updateMatrixFader,
        updateMatrixOn,
        setConfig,
        reset,
    } = useMonitorStore()

    // Connect to bridge on mount
    useEffect(() => {
        if (!user || !hasAccess) return

        let cancelled = false

        async function connectToBridge() {
            // Read bridge URL from Firestore config
            const configDoc = await getDoc(doc(db, "config", "monitor"))
            if (!configDoc.exists() || cancelled) return

            const monitorConfig = configDoc.data() as MonitorConfig
            if (!monitorConfig.bridgeUrl) return

            const client = new X32WSClient({
                onStateUpdate: (snapshot) => setSnapshot(snapshot, user!.uid),
                onFaderUpdate: (busIndex, _field, value) => updateBusFader(busIndex, value),
                onSendUpdate: (busIndex, channelIndex, field, value) => {
                    if (field === "level") updateSendLevel(busIndex, channelIndex, value as number)
                    if (field === "on") updateSendOn(busIndex, channelIndex, value as boolean)
                },
                onMatrixUpdate: (matrixIndex, field, value) => {
                    if (field === "fader") updateMatrixFader(matrixIndex, value as number)
                    if (field === "on") updateMatrixOn(matrixIndex, value as boolean)
                },
                onConfigUpdate: (cfg) => setConfig(cfg),
                onStatusChange: (s, err) => setStatus(s, err),
            })

            wsRef.current = client

            try {
                await client.connect(monitorConfig.bridgeUrl)
            } catch {
                // Auto-reconnect handles this
            }
        }

        connectToBridge()

        return () => {
            cancelled = true
            wsRef.current?.disconnect()
            wsRef.current = null
            reset()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- WebSocket: reconnect only on user change
    }, [user?.uid, hasAccess])

    // Self-assign a bus
    const handleSelectBus = useCallback(async (busIndex: number) => {
        if (!user || !config) return
        const newAssignments = { ...config.busAssignments }
        newAssignments[String(busIndex)] = {
            userId: user.uid,
            userName: user.displayName || user.email || "Unknown",
        }

        try {
            await updateDoc(doc(db, "config", "monitor"), {
                busAssignments: newAssignments,
            })
        } catch (err) {
            logger.error("Failed to self-assign bus:", err)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: depend on uid, not user object
    }, [user?.uid, config])

    // Fader handlers — own bus
    const handleBusMaster = useCallback((value: number) => {
        if (!myBusIndex) return
        updateBusFader(myBusIndex, value) // Optimistic local update
        wsRef.current?.setBusMaster(myBusIndex, value)
    }, [myBusIndex, updateBusFader])

    const handleSendLevel = useCallback((channelIndex: number, value: number) => {
        if (!myBusIndex) return
        updateSendLevel(myBusIndex, channelIndex, value)
        wsRef.current?.setSendLevel(myBusIndex, channelIndex, value)
    }, [myBusIndex, updateSendLevel])

    const handleSendOn = useCallback((channelIndex: number, on: boolean) => {
        if (!myBusIndex) return
        updateSendOn(myBusIndex, channelIndex, on)
        wsRef.current?.setSendOn(myBusIndex, channelIndex, on)
    }, [myBusIndex, updateSendOn])

    // Matrix handlers — sound engineers only
    const handleMatrixFader = useCallback((matrixIndex: number, value: number) => {
        updateMatrixFader(matrixIndex, value)
        wsRef.current?.setMatrixFader(matrixIndex, value)
    }, [updateMatrixFader])

    const handleMatrixOn = useCallback((matrixIndex: number, on: boolean) => {
        updateMatrixOn(matrixIndex, on)
        wsRef.current?.setMatrixOn(matrixIndex, on)
    }, [updateMatrixOn])

    // ── Loading ──
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

    // ── Connecting / Error ──
    if (status === "disconnected" || status === "connecting" || status === "authenticating") {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Radio className="w-8 h-8 text-violet-500 animate-pulse" />
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

    // ── No bus assigned → show selector (or bus assignment for sound engineers) ──
    if (config && myBusIndex === null) {
        return (
            <div className="max-w-lg mx-auto p-4 space-y-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Monitor</h1>
                    <ConnectionIndicator status={status} error={error} />
                </div>
                <BusSelector config={config} userId={userId || ""} onSelect={handleSelectBus} />

                {/* Sound engineers can still access matrix + assignments even without own bus */}
                {isSoundEngineer && (
                    <div className="space-y-4">
                        <BusAssignmentPanel config={config} />
                        {matrices.length > 0 && (
                            <MatrixPanel
                                matrices={matrices}
                                onFaderChange={handleMatrixFader}
                                onToggle={handleMatrixOn}
                            />
                        )}
                    </div>
                )}
            </div>
        )
    }

    // ── Main mixer view ──
    const myBus = buses.find(b => b.index === myBusIndex)
    if (!myBus) {
        return (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
                Waiting for mixer data...
            </div>
        )
    }

    // Filter sends: only show channels that are ON or have a non-zero level
    const activeSends = myBus.sends.filter(s => s.on || s.level > 0.001)
    const channelMap = new Map(channels.map(c => [c.index, c]))

    return (
        <div className="max-w-lg mx-auto p-4 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl font-bold">My Monitor</h1>
                <ConnectionIndicator status={status} error={error} />
            </div>
            <p className="text-sm text-muted-foreground mb-6">
                Bus {myBusIndex} — {myBus.name}
            </p>

            {/* Master fader */}
            <div className="bg-card border border-border rounded-xl p-4 mb-4">
                <FaderStrip
                    label="🔊 Master"
                    value={myBus.fader}
                    on={true}
                    isMaster
                    onChange={handleBusMaster}
                />
            </div>

            {/* Channel sends */}
            <div className="bg-card border border-border rounded-xl p-4">
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Channels</h2>
                <div className="space-y-1">
                    {activeSends.map(send => {
                        const ch = channelMap.get(send.channelIndex)
                        const name = ch?.name || `Ch ${send.channelIndex}`
                        return (
                            <FaderStrip
                                key={send.channelIndex}
                                label={name}
                                value={send.level}
                                on={send.on}
                                onChange={(val) => handleSendLevel(send.channelIndex, val)}
                                onToggle={(on) => handleSendOn(send.channelIndex, on)}
                            />
                        )
                    })}
                    {activeSends.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No channels routed to this bus yet.
                        </p>
                    )}
                </div>
            </div>

            {/* Sound Engineer Section — collapsible */}
            {isSoundEngineer && (
                <div className="mt-4 space-y-4">
                    <button
                        onClick={() => setShowEngSection(!showEngSection)}
                        className="flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors w-full"
                    >
                        {showEngSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        🎧 Sound Engineer
                    </button>

                    {showEngSection && (
                        <div className="space-y-4">
                            <BusAssignmentPanel config={config!} />
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
