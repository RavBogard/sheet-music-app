"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { subscribeToAllMusicianProfiles } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Save, Radio, Users, Settings2, RefreshCw, Radar } from "lucide-react"

const DEFAULT_CONFIG: MonitorConfig = {
    bridgeUrl: "ws://192.168.1.50:9000",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4],
    busAssignments: {},
    authorizedUsers: [],
}

export default function MonitorAdminPage() {
    const { user, loading: authLoading } = useAuth()
    const [config, setConfig] = useState<MonitorConfig>(DEFAULT_CONFIG)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    // All musicians with profiles
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])

    // Editable fields
    const [bridgeUrl, setBridgeUrl] = useState("")
    const [x32Address, setX32Address] = useState("")
    const [x32Port, setX32Port] = useState("10023")
    const [monitorBusesStr, setMonitorBusesStr] = useState("")
    const [busAssignments, setBusAssignments] = useState<Record<string, BusAssignment | null>>({})
    const [authorizedUsers, setAuthorizedUsers] = useState<string[]>([])
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<string | null>(null)

    // Scan for X32 on the network via the bridge's HTTP API
    const handleScan = useCallback(async () => {
        if (!bridgeUrl) {
            setScanResult("Set the bridge URL first")
            return
        }
        setScanning(true)
        setScanResult(null)
        try {
            // Derive HTTP API URL from WebSocket URL (same host, port + 1)
            const wsUrl = new URL(bridgeUrl)
            const httpPort = parseInt(wsUrl.port) + 1
            const httpUrl = `http://${wsUrl.hostname}:${httpPort}/scan`

            const res = await fetch(httpUrl, { signal: AbortSignal.timeout(8000) })
            const data = await res.json()
            if (data.found) {
                setX32Address(data.address)
                setScanResult(`Found ${data.name} (${data.model}) at ${data.address}`)
            } else {
                setScanResult("No X32 found on the network")
            }
        } catch {
            setScanResult("Could not reach bridge server — is it running?")
        } finally {
            setScanning(false)
        }
    }, [bridgeUrl])

    // Load config
    useEffect(() => {
        async function load() {
            try {
                const configDoc = await getDoc(doc(db, "config", "monitor"))
                const data = configDoc.exists()
                    ? { ...DEFAULT_CONFIG, ...configDoc.data() as Partial<MonitorConfig> }
                    : DEFAULT_CONFIG

                setConfig(data)
                setBridgeUrl(data.bridgeUrl)
                setX32Address(data.x32Address)
                setX32Port(String(data.x32Port))
                setMonitorBusesStr(data.monitorBuses.join(", "))
                setBusAssignments(data.busAssignments || {})
                setAuthorizedUsers(data.authorizedUsers || [])
            } catch (err) {
                console.error("Failed to load monitor config:", err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    // Load musicians
    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles(setMusicians)
        return unsub
    }, [])

    const handleSave = useCallback(async () => {
        setSaving(true)
        setSaved(false)

        const parsed: MonitorConfig = {
            bridgeUrl: bridgeUrl.trim(),
            x32Address: x32Address.trim(),
            x32Port: parseInt(x32Port) || 10023,
            monitorBuses: monitorBusesStr
                .split(",")
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n >= 1 && n <= 16),
            busAssignments,
            authorizedUsers,
        }

        try {
            const ref = doc(db, "config", "monitor")
            const existing = await getDoc(ref)
            if (existing.exists()) {
                await updateDoc(ref, { ...parsed } as Record<string, unknown>)
            } else {
                await setDoc(ref, parsed)
            }
            setConfig(parsed)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } catch (err) {
            console.error("Failed to save monitor config:", err)
        } finally {
            setSaving(false)
        }
    }, [bridgeUrl, x32Address, x32Port, monitorBusesStr, busAssignments, authorizedUsers])

    const toggleAuthorized = (uid: string) => {
        setAuthorizedUsers(prev =>
            prev.includes(uid)
                ? prev.filter(u => u !== uid)
                : [...prev, uid]
        )
    }

    const assignBus = (busIdx: number, userId: string | null) => {
        setBusAssignments(prev => {
            const next = { ...prev }
            if (!userId) {
                next[String(busIdx)] = null
            } else {
                const musician = musicians.find(m => m.uid === userId)
                next[String(busIdx)] = {
                    userId,
                    userName: musician?.displayName || "Unknown",
                }
            }
            return next
        })
    }

    const parsedBuses = monitorBusesStr
        .split(",")
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n) && n >= 1 && n <= 16)

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Monitor Admin</h1>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <RefreshCw className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saved ? "Saved!" : "Save"}
                </Button>
            </div>

            {/* Bridge Configuration */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Radio className="w-5 h-5 text-violet-500" />
                    <h2 className="text-lg font-semibold">Bridge Server</h2>
                </div>

                <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Bridge WebSocket URL</label>
                    <Input
                        value={bridgeUrl}
                        onChange={e => setBridgeUrl(e.target.value)}
                        placeholder="ws://192.168.1.50:9000"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        The LAN IP of the production PC running the bridge server
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">X32 IP Address</label>
                        <div className="flex gap-2">
                            <Input
                                value={x32Address}
                                onChange={e => setX32Address(e.target.value)}
                                placeholder="192.168.1.100"
                                className="flex-1"
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleScan}
                                disabled={scanning}
                                title="Scan network for X32"
                            >
                                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                            </Button>
                        </div>
                        {scanResult && (
                            <p className={`text-xs mt-1 ${scanResult.includes("Found") ? "text-green-500" : "text-yellow-500"}`}>
                                {scanResult}
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">X32 OSC Port</label>
                        <Input
                            value={x32Port}
                            onChange={e => setX32Port(e.target.value)}
                            placeholder="10023"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Monitor Buses (comma-separated)</label>
                    <Input
                        value={monitorBusesStr}
                        onChange={e => setMonitorBusesStr(e.target.value)}
                        placeholder="1, 2, 3, 4"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        Which X32 mix buses are used as monitor sends (1–16)
                    </p>
                </div>
            </div>

            {/* Bus Assignments */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Settings2 className="w-5 h-5 text-blue-500" />
                    <h2 className="text-lg font-semibold">Bus Assignments</h2>
                </div>

                {parsedBuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Add monitor bus numbers above to assign them.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {parsedBuses.map(busIdx => {
                            const assignment = busAssignments[String(busIdx)]
                            return (
                                <div key={busIdx} className="flex items-center gap-3">
                                    <span className="text-sm font-medium w-16 shrink-0">Bus {busIdx}</span>
                                    <select
                                        value={assignment?.userId || ""}
                                        onChange={e => assignBus(busIdx, e.target.value || null)}
                                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">Unassigned</option>
                                        {musicians.map(m => (
                                            <option key={m.uid} value={m.uid}>
                                                {m.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Authorized Users */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-green-500" />
                    <h2 className="text-lg font-semibold">Monitor Access</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Only checked users will see the Monitor tab.
                </p>

                {musicians.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                        No musician profiles found. Musicians need to set up their profile in Settings first.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {musicians.map(m => (
                            <label
                                key={m.uid}
                                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={authorizedUsers.includes(m.uid)}
                                    onChange={() => toggleAuthorized(m.uid)}
                                    className="w-4 h-4 rounded border-border accent-violet-600"
                                />
                                <span className="text-sm font-medium">{m.displayName}</span>
                                {m.profile.instrument && (
                                    <span className="text-xs text-muted-foreground">
                                        ({m.profile.instrument})
                                    </span>
                                )}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
