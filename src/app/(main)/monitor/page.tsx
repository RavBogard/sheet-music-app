"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorStore } from "@/lib/monitor-store"
import { X32WSClient } from "@/lib/x32-ws-client"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { BusSelector } from "@/components/monitor/BusSelector"
import { ConnectionIndicator } from "@/components/monitor/ConnectionIndicator"
import { MonitorConfig } from "@/types/monitor"
import { Loader2, Radio } from "lucide-react"
import { logger } from "@/lib/logger"

export default function MonitorPage() {
    const { user, loading: authLoading } = useAuth()
    const wsRef = useRef<X32WSClient | null>(null)

    const {
        status,
        error,
        channels,
        buses,
        config,
        myBusIndex,
        userId,
        setStatus,
        setSnapshot,
        updateBusFader,
        updateSendLevel,
        updateSendOn,
        setConfig,
        reset,
    } = useMonitorStore()

    // Connect to bridge on mount
    useEffect(() => {
        if (!user) return

        let cancelled = false

        async function connectToBridge() {
            // Read bridge URL from Firestore config
            const configDoc = await getDoc(doc(db, "config", "monitor"))
            if (!configDoc.exists() || cancelled) return

            const monitorConfig = configDoc.data() as MonitorConfig
            if (!monitorConfig.bridgeUrl) return

            // Check authorization
            if (!monitorConfig.authorizedUsers?.includes(user!.uid)) {
                setStatus("error", "You don't have monitor access. Ask an admin to enable it.")
                return
            }

            const client = new X32WSClient({
                onStateUpdate: (snapshot) => setSnapshot(snapshot, user!.uid),
                onFaderUpdate: (busIndex, _field, value) => updateBusFader(busIndex, value),
                onSendUpdate: (busIndex, channelIndex, field, value) => {
                    if (field === "level") updateSendLevel(busIndex, channelIndex, value as number)
                    if (field === "on") updateSendOn(busIndex, channelIndex, value as boolean)
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
    }, [user?.uid])

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

    // Fader handlers
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

    // ── Loading ──
    if (authLoading) {
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

    // ── No bus assigned → show selector ──
    if (config && myBusIndex === null) {
        return (
            <div className="max-w-lg mx-auto p-4">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Monitor</h1>
                    <ConnectionIndicator status={status} error={error} />
                </div>
                <BusSelector config={config} userId={userId || ""} onSelect={handleSelectBus} />
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
        </div>
    )
}
