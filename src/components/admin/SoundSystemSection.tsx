"use client"

import { useState, useEffect, useCallback } from "react"
import { doc, getDoc, onSnapshot, updateDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { subscribeToAllMusicianProfiles } from "@/lib/musician-profile"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { MonitorSetupWizard } from "@/components/admin/MonitorSetupWizard"
import { MusicianProfile } from "@/types/models"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import {
    Loader2, Radio, CheckCircle,
    Radar, Save, Settings2, Music2, Download, Copy, KeyRound,
} from "lucide-react"

const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
    bridgeUrl: "ws://192.168.1.50:9000",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4],
    busAssignments: {},
}

export function SoundSystemSection() {
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])
    const [monitorLoading, setMonitorLoading] = useState(true)
    const [monitorConfigExists, setMonitorConfigExists] = useState(true)
    const [monitorSaving, setMonitorSaving] = useState(false)
    const [monitorSaved, setMonitorSaved] = useState(false)
    const [bridgeUrl, setBridgeUrl] = useState("")
    const [x32Address, setX32Address] = useState("")
    const [x32Port, setX32Port] = useState("10023")
    const [monitorBusesStr, setMonitorBusesStr] = useState("")
    const [busAssignments, setBusAssignments] = useState<Record<string, BusAssignment | null>>({})
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<string | null>(null)
    const [bridgeStatus, setBridgeStatus] = useState<{ status: string; lastSeen: Date | null; x32Connected: boolean; clients: number; version: string } | null>(null)
    const [setupCode, setSetupCode] = useState<string | null>(null)
    const [setupCodeExpiry, setSetupCodeExpiry] = useState<number | null>(null)
    const [generatingCode, setGeneratingCode] = useState(false)

    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles(setMusicians)
        return unsub
    }, [])

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "config", "monitor"), (configDoc) => {
            try {
                const data = configDoc.exists()
                    ? { ...DEFAULT_MONITOR_CONFIG, ...configDoc.data() as Partial<MonitorConfig> }
                    : DEFAULT_MONITOR_CONFIG
                setMonitorConfigExists(configDoc.exists())
                setBridgeUrl(data.bridgeUrl)
                setX32Address(data.x32Address)
                setX32Port(String(data.x32Port))
                setMonitorBusesStr(data.monitorBuses.join(", "))
                setBusAssignments(data.busAssignments || {})

                const raw = configDoc.data()
                const bridge = raw?.bridge
                if (bridge?.lastSeen) {
                    const ts = bridge.lastSeen
                    let lastSeen: Date | null = null
                    try {
                        if (ts.toDate) lastSeen = ts.toDate()
                        else if (ts.seconds) lastSeen = new Date(ts.seconds * 1000)
                    } catch { /* ignore */ }
                    setBridgeStatus({
                        status: bridge.status || "unknown",
                        lastSeen,
                        x32Connected: bridge.x32Connected ?? false,
                        clients: bridge.clients ?? 0,
                        version: bridge.version || "?",
                    })
                }
            } catch (err) {
                logger.error("Failed to load monitor config:", err)
            } finally {
                setMonitorLoading(false)
            }
        })
        return unsub
    }, [])

    const handleScan = useCallback(async () => {
        if (!bridgeUrl) { setScanResult("Set the bridge URL first"); return }
        setScanning(true); setScanResult(null)
        try {
            const wsUrl = new URL(bridgeUrl)
            const httpPort = parseInt(wsUrl.port) + 1
            const res = await fetch(`http://${wsUrl.hostname}:${httpPort}/scan`, { signal: AbortSignal.timeout(8000) })
            const data = await res.json()
            if (data.found) {
                setX32Address(data.address)
                setScanResult(`Found ${data.name} (${data.model}) at ${data.address}`)
            } else {
                setScanResult("No X32 found on the network")
            }
        } catch {
            setScanResult("Could not reach bridge server — is it running?")
        } finally { setScanning(false) }
    }, [bridgeUrl])

    const handleGenerateSetupCode = useCallback(async () => {
        setGeneratingCode(true)
        try {
            const { auth: firebaseAuth } = await import("@/lib/firebase")
            const user = firebaseAuth.currentUser
            if (!user) throw new Error("Not signed in")
            const token = await user.getIdToken()
            const res = await fetch("/api/bridge/setup-code", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "Failed to generate code")
            }
            const { code, expiresAt } = await res.json()
            setSetupCode(code)
            setSetupCodeExpiry(expiresAt)
            toast.success("Setup code generated")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to generate setup code")
        } finally {
            setGeneratingCode(false)
        }
    }, [])

    const handleMonitorSave = useCallback(async () => {
        setMonitorSaving(true); setMonitorSaved(false)
        const parsed: MonitorConfig = {
            bridgeUrl: bridgeUrl.trim(),
            x32Address: x32Address.trim(),
            x32Port: parseInt(x32Port) || 10023,
            monitorBuses: monitorBusesStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 16),
            busAssignments,
        }
        try {
            const ref = doc(db, "config", "monitor")
            const existing = await getDoc(ref)
            if (existing.exists()) { await updateDoc(ref, { ...parsed } as Record<string, unknown>) }
            else { await setDoc(ref, parsed) }
            setMonitorSaved(true)
            toast.success("Monitor config saved")
            setTimeout(() => setMonitorSaved(false), 2000)
        } catch (err) {
            logger.error("Failed to save:", err)
            toast.error("Failed to save monitor config")
        } finally { setMonitorSaving(false) }
    }, [bridgeUrl, x32Address, x32Port, monitorBusesStr, busAssignments])

    const assignBus = (busIdx: number, userId: string | null) => {
        setBusAssignments(prev => {
            const next = { ...prev }
            if (!userId) { next[String(busIdx)] = null }
            else {
                const musician = musicians.find(m => m.uid === userId)
                next[String(busIdx)] = { userId, userName: musician?.displayName || "Unknown" }
            }
            return next
        })
    }

    const parsedBuses = monitorBusesStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 16)

    return (
        <CollapsibleSection
            icon={<Radio className="w-4 h-4 text-blue-500" />}
            title="Sound System"
            action={
                <Button onClick={handleMonitorSave} disabled={monitorSaving} size="sm" className="gap-2">
                    {monitorSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : monitorSaved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {monitorSaved ? "Saved!" : "Save"}
                </Button>
            }
        >
            {monitorLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : !monitorConfigExists ? (
                <MonitorSetupWizard
                    bridgeUrl={bridgeUrl}
                    setBridgeUrl={setBridgeUrl}
                    x32Address={x32Address}
                    setX32Address={setX32Address}
                    onScan={handleScan}
                    scanning={scanning}
                    scanResult={scanResult}
                    monitorBusesStr={monitorBusesStr}
                    setMonitorBusesStr={setMonitorBusesStr}
                    onComplete={() => { handleMonitorSave(); setMonitorConfigExists(true) }}
                />
            ) : (
                <div className="space-y-4">
                    {/* Bridge Installation */}
                    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                            <Download className="w-4 h-4 text-muted-foreground" />
                            Bridge Installation
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            The bridge runs on the production PC and connects iPads to the X32 mixer. Generate a setup code, then enter it in the bridge installer — no Firebase Console needed.
                        </p>
                        <div className="flex items-center gap-3">
                            <Button onClick={handleGenerateSetupCode} disabled={generatingCode} variant="outline" size="sm" className="gap-2">
                                {generatingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                                Generate Setup Code
                            </Button>
                            {setupCode && (
                                <div className="flex items-center gap-2">
                                    <code className="bg-muted px-4 py-2 rounded-lg text-lg font-mono font-bold tracking-[0.3em] select-all">
                                        {setupCode}
                                    </code>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                        navigator.clipboard.writeText(setupCode)
                                        toast.success("Copied!")
                                    }}>
                                        <Copy className="w-3 h-3" />
                                    </Button>
                                    {setupCodeExpiry && (
                                        <span className="text-xs text-muted-foreground">
                                            Expires in {Math.max(0, Math.round((setupCodeExpiry - Date.now()) / 60000))} min
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                            <Settings2 className="w-4 h-4 text-muted-foreground" />
                            Bridge Server & X32
                        </h3>
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Bridge WebSocket URL</label>
                            <Input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} placeholder="ws://192.168.1.50:9000" />
                            <p className="text-xs text-muted-foreground mt-1">Auto-detected by the bridge on startup</p>
                        </div>

                        {bridgeStatus && (
                            <div className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                                bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                    ? "bg-green-500/10 border border-green-500/20"
                                    : "bg-red-500/10 border border-red-500/20"
                            }`}>
                                <div className={`w-2 h-2 rounded-full ${
                                    bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                        ? "bg-green-500 animate-pulse" : "bg-red-500"
                                }`} />
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium">
                                        {bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000
                                            ? "Bridge Online" : "Bridge Offline"}
                                    </span>
                                    {bridgeStatus.status === "online" && bridgeStatus.lastSeen && (Date.now() - bridgeStatus.lastSeen.getTime()) < 120000 && (
                                        <span className="text-muted-foreground ml-2">
                                            X32: {bridgeStatus.x32Connected ? "✓" : "✗"}
                                            {" · "}
                                            {bridgeStatus.clients} client{bridgeStatus.clients !== 1 ? "s" : ""}
                                            {" · "}
                                            v{bridgeStatus.version}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">X32 IP Address</label>
                                <div className="flex gap-2">
                                    <Input value={x32Address} onChange={e => setX32Address(e.target.value)} placeholder="Auto-detected" className="flex-1" />
                                    <Button variant="outline" size="icon" onClick={handleScan} disabled={scanning} title="Scan network for X32">
                                        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                                    </Button>
                                </div>
                                {scanResult && (
                                    <p className={`text-xs mt-1 ${scanResult.includes("Found") ? "text-green-500" : "text-yellow-500"}`}>{scanResult}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm text-muted-foreground mb-1 block">OSC Port</label>
                                <Input value={x32Port} onChange={e => setX32Port(e.target.value)} placeholder="10023" />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Monitor Buses</label>
                            <Input value={monitorBusesStr} onChange={e => setMonitorBusesStr(e.target.value)} placeholder="1, 2, 3, 4" />
                            <p className="text-xs text-muted-foreground mt-1">X32 mix buses used as monitor sends (1–16, comma-separated)</p>
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                        <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                            <Music2 className="w-4 h-4 text-muted-foreground" />
                            Bus Assignments
                        </h3>
                        {parsedBuses.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Add monitor bus numbers above to assign them.</p>
                        ) : (
                            <div className="space-y-2">
                                {parsedBuses.map(busIdx => {
                                    const assignment = busAssignments[String(busIdx)]
                                    return (
                                        <div key={busIdx} className="flex items-center gap-3">
                                            <span className="text-sm font-medium w-16 shrink-0">Bus {busIdx}</span>
                                            <select value={assignment?.userId || ""} onChange={e => assignBus(busIdx, e.target.value || null)}
                                                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                                <option value="">Unassigned</option>
                                                {musicians.map(m => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
                                            </select>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </CollapsibleSection>
    )
}
