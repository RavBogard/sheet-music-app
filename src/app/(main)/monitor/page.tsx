"use client"

import { useCallback, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useMonitorStore } from "@/lib/monitor-store"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { FaderStrip } from "@/components/monitor/FaderStrip"
import { BusSelector } from "@/components/monitor/BusSelector"
import { ConnectionIndicator } from "@/components/monitor/ConnectionIndicator"
import { MatrixPanel } from "@/components/monitor/MatrixPanel"
import { BusAssignmentPanel } from "@/components/monitor/BusAssignmentPanel"
import { Loader2, Radio, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

export default function MonitorPage() {
    const { user, loading: authLoading, isAdmin } = useAuth()
    const { hasAccess, isSoundEngineer, loading: accessLoading } = useMonitorAccess()
    // Fix #4: sound engineers see their section open by default
    const [showEngSection, setShowEngSection] = useState(true)

    // Fix #9: singleton connection — shared with QuickMonitorPanel
    const { client } = useMonitorConnection()

    const {
        status, error, channels, buses, matrices, config, myBusIndex, userId,
        updateBusFader, updateSendLevel, updateSendOn, updateMatrixFader, updateMatrixOn,
    } = useMonitorStore()

    // Admins or sound engineers get full controls
    const hasEngineerAccess = isSoundEngineer || isAdmin

    // Fix #2: Self-assign with error handling
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
            toast.success(`Assigned to Bus ${busIndex}`)
        } catch (err) {
            logger.error("Failed to self-assign bus:", err)
            toast.error("Can't self-assign — ask a sound engineer to assign you")
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, config])

    // Fader handlers — own bus
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

    // Matrix handlers — engineers only
    const handleMatrixFader = useCallback((matrixIndex: number, value: number) => {
        updateMatrixFader(matrixIndex, value)
        client?.setMatrixFader(matrixIndex, value)
    }, [updateMatrixFader, client])

    const handleMatrixOn = useCallback((matrixIndex: number, on: boolean) => {
        updateMatrixOn(matrixIndex, on)
        client?.setMatrixOn(matrixIndex, on)
    }, [updateMatrixOn, client])

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

    // ── Fix #3: Engineer without a bus → engineer dashboard (not "pick your bus") ──
    if (config && myBusIndex === null && hasEngineerAccess) {
        return (
            <div className="max-w-lg mx-auto p-4 space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold">Sound Engineer</h1>
                    <ConnectionIndicator status={status} error={error} />
                </div>

                <BusAssignmentPanel config={config} />

                {matrices.length > 0 && (
                    <MatrixPanel
                        matrices={matrices}
                        onFaderChange={handleMatrixFader}
                        onToggle={handleMatrixOn}
                    />
                )}

                {/* Subtle option to self-assign a personal bus */}
                <p className="text-xs text-muted-foreground text-center pt-2">
                    Need a personal monitor mix?{" "}
                    <button
                        onClick={() => {
                            // Find first unassigned bus
                            const available = config.monitorBuses.find(b => !config.busAssignments[String(b)])
                            if (available) handleSelectBus(available)
                            else toast.error("No buses available")
                        }}
                        className="text-violet-400 hover:text-violet-300 underline"
                    >
                        Assign yourself a bus
                    </button>
                </p>
            </div>
        )
    }

    // ── Musician without a bus → bus selector ──
    if (config && myBusIndex === null) {
        return (
            <div className="max-w-lg mx-auto p-4 space-y-6">
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

            {/* Sound Engineer Section — collapsible, open by default */}
            {hasEngineerAccess && (
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
