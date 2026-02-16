"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { subscribeToAllMusicianProfiles } from "@/lib/musician-profile"
import { UserProfile, subscribeToAllUsers } from "@/lib/users-firebase"
import { UserRow } from "@/components/admin/UserRow"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { MusicianProfile } from "@/types/models"
import { MonitorConfig, BusAssignment } from "@/types/monitor"
import { SyncStats } from "@/lib/sync-engine"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import buildInfo from "@/build-info.json"
import { logger } from "@/lib/logger"
import {
    Loader2, Users, Radio, Database, Repeat, CheckCircle, ShieldAlert,
    Radar, Save, Settings2, ShieldCheck, AlertTriangle,
    Tag, GitCommit, Wrench, Music2,
} from "lucide-react"

// ─── Constants ───

const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
    bridgeUrl: "ws://192.168.1.50:9000",
    x32Address: "192.168.1.100",
    x32Port: 10023,
    monitorBuses: [1, 2, 3, 4],
    busAssignments: {},
    authorizedUsers: [],
}

interface GhostFile {
    id: string
    name: string
    mimeType: string
    lastSyncedAt: string
}

export default function AdminDashboard() {
    const { user, isAdmin, loading: authLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!authLoading && !isAdmin) router.push("/")
    }, [authLoading, isAdmin, router])

    // ══════════════════════════════════════
    // PEOPLE
    // ══════════════════════════════════════
    const [users, setUsers] = useState<UserProfile[]>([])
    const [usersLoading, setUsersLoading] = useState(true)

    useEffect(() => {
        if (!isAdmin) return
        const unsub = subscribeToAllUsers(
            (data) => { setUsers(data); setUsersLoading(false) },
            () => setUsersLoading(false)
        )
        return unsub
    }, [isAdmin])

    const pendingCount = users.filter(u => u.role === "pending").length

    // ══════════════════════════════════════
    // SOUND (Monitor Config)
    // ══════════════════════════════════════
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])
    const [monitorLoading, setMonitorLoading] = useState(true)
    const [monitorSaving, setMonitorSaving] = useState(false)
    const [monitorSaved, setMonitorSaved] = useState(false)
    const [bridgeUrl, setBridgeUrl] = useState("")
    const [x32Address, setX32Address] = useState("")
    const [x32Port, setX32Port] = useState("10023")
    const [monitorBusesStr, setMonitorBusesStr] = useState("")
    const [busAssignments, setBusAssignments] = useState<Record<string, BusAssignment | null>>({})
    const [authorizedUsers, setAuthorizedUsers] = useState<string[]>([])
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState<string | null>(null)

    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles(setMusicians)
        return unsub
    }, [])

    useEffect(() => {
        async function load() {
            try {
                const configDoc = await getDoc(doc(db, "config", "monitor"))
                const data = configDoc.exists()
                    ? { ...DEFAULT_MONITOR_CONFIG, ...configDoc.data() as Partial<MonitorConfig> }
                    : DEFAULT_MONITOR_CONFIG
                setBridgeUrl(data.bridgeUrl)
                setX32Address(data.x32Address)
                setX32Port(String(data.x32Port))
                setMonitorBusesStr(data.monitorBuses.join(", "))
                setBusAssignments(data.busAssignments || {})
                setAuthorizedUsers(data.authorizedUsers || [])
            } catch (err) {
                logger.error("Failed to load monitor config:", err)
            } finally {
                setMonitorLoading(false)
            }
        }
        load()
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

    const handleMonitorSave = useCallback(async () => {
        setMonitorSaving(true); setMonitorSaved(false)
        const parsed: MonitorConfig = {
            bridgeUrl: bridgeUrl.trim(),
            x32Address: x32Address.trim(),
            x32Port: parseInt(x32Port) || 10023,
            monitorBuses: monitorBusesStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 16),
            busAssignments,
            authorizedUsers,
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
    }, [bridgeUrl, x32Address, x32Port, monitorBusesStr, busAssignments, authorizedUsers])

    const toggleAuthorized = (uid: string) => {
        setAuthorizedUsers(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid])
    }

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

    // ══════════════════════════════════════
    // LIBRARY & DATA
    // ══════════════════════════════════════
    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)
    const [enriching, setEnriching] = useState(false)
    const [enrichStats, setEnrichStats] = useState<{ processed?: number; enriched?: number } | null>(null)
    const [clearingChords, setClearingChords] = useState(false)
    const [migrating, setMigrating] = useState(false)
    const [migrationStats, setMigrationStats] = useState<{
        total: number; succeeded: number; failed: number; remaining: number;
        previouslyDone: number; previouslyFailed: number; message: string
    } | null>(null)
    const [pruneLoading, setPruneLoading] = useState(false)
    const [pruneScanData, setPruneScanData] = useState<{
        driveCount: number; dbCount: number; ghosts: GhostFile[]; prunedCount?: number
    } | null>(null)

    const getToken = async () => user ? await user.getIdToken() : ""

    const handleSync = async () => {
        setSyncing(true); setLastStats(null)
        try {
            const res = await fetch("/api/library/sync", { method: "POST", headers: { Authorization: `Bearer ${await getToken()}` } })
            if (!res.ok) throw new Error(await res.text())
            setLastStats((await res.json()).stats)
            toast.success("Library sync complete!")
        } catch (e: unknown) { toast.error("Sync failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setSyncing(false) }
    }

    const handleEnrich = async () => {
        setEnriching(true); setEnrichStats(null)
        try {
            const res = await fetch("/api/admin/enrich", { method: "POST", headers: { Authorization: `Bearer ${await getToken()}` } })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed")
            setEnrichStats(data.stats)
            if (data.message) toast.success(data.message)
        } catch (e: unknown) { toast.error("Enrichment failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setEnriching(false) }
    }

    const handleClearChordCache = async () => {
        setClearingChords(true)
        try {
            const res = await fetch("/api/admin/migrate-storage/reset", { method: "DELETE", headers: { Authorization: `Bearer ${await getToken()}` } })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed")
            toast.success(`Cleared ${data.cleared} cached chord scans.`)
        } catch (e: unknown) { toast.error("Failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setClearingChords(false) }
    }

    const handleMigration = async () => {
        setMigrating(true); setMigrationStats(null)
        let totalSucceeded = 0, totalFailed = 0
        try {
            const token = await getToken()
            let remaining = Infinity, rounds = 0
            while (remaining > 0 && rounds < 25) {
                rounds++
                let res: Response
                try { res = await fetch("/api/admin/migrate-storage", { method: "POST", headers: { Authorization: `Bearer ${token}` } }) }
                catch {
                    await new Promise(r => setTimeout(r, 3000))
                    try { res = await fetch("/api/admin/migrate-storage", { method: "POST", headers: { Authorization: `Bearer ${token}` } }) }
                    catch { toast.error("Network error"); break }
                }
                const data = await res!.json()
                if (!res!.ok) { toast.error(data.error || "Batch failed"); break }
                totalSucceeded += data.succeeded || 0
                totalFailed += data.failed || 0
                remaining = data.remaining || 0
                setMigrationStats({ total: data.total, succeeded: totalSucceeded, failed: totalFailed, remaining, previouslyDone: data.previouslyDone || 0, previouslyFailed: data.previouslyFailed || 0, message: data.message })
                if (data.processed === 0) break
            }
            if (remaining <= 0) toast.success("Migration complete!")
            else toast.info(`Paused: ${totalSucceeded} migrated, ${remaining} remaining`)
        } catch (e: unknown) { toast.error("Migration failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setMigrating(false) }
    }

    const handleScanAndPrune = async () => {
        setPruneLoading(true); setPruneScanData(null)
        try {
            const token = await getToken()
            const scanRes = await fetch("/api/admin/prune/scan", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
            if (!scanRes.ok) throw new Error(await scanRes.text())
            const data = await scanRes.json()
            if (data.ghostCount === 0) {
                setPruneScanData(data); toast.success("System clean.")
            } else {
                toast.loading(`Pruning ${data.ghostCount} ghost files...`)
                const pruneRes = await fetch("/api/admin/prune/execute", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ fileIds: data.ghosts.map((g: GhostFile) => g.id) })
                })
                if (!pruneRes.ok) throw new Error("Prune failed")
                const pruneData = await pruneRes.json()
                setPruneScanData({ ...data, ghosts: [], prunedCount: pruneData.deletedCount })
                toast.dismiss(); toast.success(`Removed ${pruneData.deletedCount} ghost files.`)
            }
        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Error") }
        finally { setPruneLoading(false) }
    }

    // ── Loading / Auth ──
    if (authLoading) return (
        <div className="h-screen bg-background flex items-center justify-center">
            <Loader2 className="animate-spin text-violet-500" />
        </div>
    )
    if (!isAdmin) return null

    return (
        <div className="min-h-screen bg-background text-foreground pb-24">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-10">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <ShieldAlert className="w-6 h-6 text-violet-500" />
                        Admin
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Users, sound system, library, and system settings.
                    </p>
                </div>

                {/* ═══ PEOPLE ═══ */}
                <CollapsibleSection
                    icon={<Users className="w-4 h-4 text-violet-500" />}
                    title="People"
                    badge={pendingCount > 0 ? (
                        <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">
                            {pendingCount} pending
                        </span>
                    ) : undefined}
                    defaultOpen={pendingCount > 0}
                >

                    {usersLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="space-y-2">
                            {users.map((u) => <UserRow key={u.uid} user={u} currentUserUid={user?.uid || ""} />)}
                            {users.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No registered users yet.</p>}
                        </div>
                    )}
                </CollapsibleSection>

                {/* ═══ SOUND SYSTEM ═══ */}
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
                    ) : (
                        <div className="space-y-4">
                            {/* Bridge & X32 */}
                            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                                    Bridge Server & X32
                                </h3>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-1 block">Bridge WebSocket URL</label>
                                    <Input value={bridgeUrl} onChange={e => setBridgeUrl(e.target.value)} placeholder="ws://192.168.1.50:9000" />
                                    <p className="text-xs text-muted-foreground mt-1">LAN IP of the production PC running the bridge</p>
                                </div>

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

                            {/* Bus Assignments */}
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

                            {/* Monitor Access */}
                            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <Users className="w-4 h-4 text-muted-foreground" />
                                    Monitor Access
                                </h3>
                                <p className="text-xs text-muted-foreground">Only checked users see the Monitor tab.</p>
                                {musicians.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">No musician profiles yet. Musicians set these up in Settings.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {musicians.map(m => (
                                            <label key={m.uid} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted cursor-pointer">
                                                <input type="checkbox" checked={authorizedUsers.includes(m.uid)} onChange={() => toggleAuthorized(m.uid)}
                                                    className="w-4 h-4 rounded border-border accent-violet-600" />
                                                <span className="text-sm font-medium">{m.displayName}</span>
                                                {m.profile.instrument && <span className="text-xs text-muted-foreground">({m.profile.instrument})</span>}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </CollapsibleSection>

                {/* ═══ LIBRARY & DATA ═══ */}
                <CollapsibleSection
                    icon={<Database className="w-4 h-4 text-teal-500" />}
                    title="Library & Data"
                >

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Library Sync */}
                        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                            <h3 className="font-semibold text-foreground text-sm">Library Sync</h3>
                            <p className="text-xs text-muted-foreground">Sync Google Drive → library</p>
                            <Button onClick={handleSync} disabled={syncing} className="w-full gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl" size="sm">
                                <Repeat className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                                {syncing ? "Syncing..." : "Sync Now"}
                            </Button>
                            {lastStats && (
                                <div className="p-2 bg-muted/50 rounded-lg text-xs border border-border">
                                    <span className="text-green-500 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Done</span>
                                    <span className="text-muted-foreground">Scanned: {lastStats.totalScanned} · New: {lastStats.added}</span>
                                </div>
                            )}
                        </div>

                        {/* AI Enrichment */}
                        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                            <h3 className="font-semibold text-foreground text-sm">AI Enrichment</h3>
                            <p className="text-xs text-muted-foreground">Extract keys, BPM, metadata from PDFs</p>
                            <Button onClick={handleEnrich} disabled={enriching} className="w-full gap-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl" size="sm">
                                <Repeat className={`w-3 h-3 ${enriching ? "animate-spin" : ""}`} />
                                {enriching ? "Enriching..." : "Run Enrichment"}
                            </Button>
                            {enrichStats && (
                                <div className="p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground border border-border">
                                    Processed: {enrichStats.processed} · Enriched: {enrichStats.enriched}
                                </div>
                            )}
                        </div>

                        {/* Firebase Migration */}
                        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                            <h3 className="font-semibold text-foreground text-sm">Firebase Migration</h3>
                            <p className="text-xs text-muted-foreground">Drive → Firebase Storage CDN</p>
                            <Button onClick={handleMigration} disabled={migrating} className="w-full gap-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl" size="sm">
                                <Repeat className={`w-3 h-3 ${migrating ? "animate-spin" : ""}`} />
                                {migrating ? "Migrating..." : "Migrate Files"}
                            </Button>
                            {migrationStats && (
                                <div className="p-2 bg-muted/50 rounded-lg text-xs space-y-1 border border-border">
                                    <span className={`flex items-center gap-1 font-semibold ${migrationStats.remaining > 0 ? "text-orange-500" : "text-green-500"}`}>
                                        <CheckCircle className="w-3 h-3" /> {migrationStats.remaining > 0 ? "In Progress..." : "Complete"}
                                    </span>
                                    <span className="text-muted-foreground">
                                        Migrated: {migrationStats.succeeded} · Remaining: {migrationStats.remaining}
                                        {migrationStats.failed > 0 && <span className="text-red-500"> · Failed: {migrationStats.failed}</span>}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Chord Cache */}
                        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                            <h3 className="font-semibold text-foreground text-sm">Chord Cache</h3>
                            <p className="text-xs text-muted-foreground">Clear cached chords so charts rescan</p>
                            <Button onClick={handleClearChordCache} disabled={clearingChords} variant="outline" className="w-full gap-2 rounded-xl" size="sm">
                                <Repeat className={`w-3 h-3 ${clearingChords ? "animate-spin" : ""}`} />
                                {clearingChords ? "Clearing..." : "Clear Chord Cache"}
                            </Button>
                        </div>

                        {/* Data Integrity */}
                        <div className="bg-card border border-border p-5 rounded-xl space-y-3 sm:col-span-2">
                            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-orange-500" /> Data Integrity
                            </h3>
                            <p className="text-xs text-muted-foreground">Find &quot;ghost files&quot; deleted in Drive but still in the app.</p>
                            <Button onClick={handleScanAndPrune} disabled={pruneLoading} variant="outline" className="gap-2 rounded-xl" size="sm">
                                {pruneLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                                {pruneLoading ? "Scanning..." : "Run Consistency Check"}
                            </Button>
                            {pruneScanData && (
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-muted-foreground">Drive: <span className="text-foreground font-mono">{pruneScanData.driveCount}</span></span>
                                    <span className="text-muted-foreground">DB: <span className="text-foreground font-mono">{pruneScanData.dbCount}</span></span>
                                    {pruneScanData.ghosts.length === 0 && (
                                        <span className="flex items-center gap-1 text-green-500">
                                            <CheckCircle className="w-3 h-3" /> {pruneScanData.prunedCount ? `Removed ${pruneScanData.prunedCount}` : "Clean"}
                                        </span>
                                    )}
                                    {pruneScanData.ghosts.length > 0 && (
                                        <span className="flex items-center gap-1 text-red-400">
                                            <AlertTriangle className="w-3 h-3" /> {pruneScanData.ghosts.length} ghosts
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ═══ SYSTEM ═══ */}
                <CollapsibleSection
                    icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
                    title="System"
                >

                    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-blue-400" />
                            <span className="font-mono text-sm text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">v{buildInfo.version}</span>
                            <span className="text-xs text-muted-foreground">Built {buildInfo.buildDate} · {buildInfo.commit?.slice(0, 7)}</span>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <GitCommit className="w-3 h-3 text-muted-foreground" /> Recent Changes
                            </h3>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {buildInfo.changelog.map((log, i) => {
                                    const parts = log.match(/^([^ ]+) - (.*)$/)
                                    return (
                                        <div key={i} className="text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">
                                            {parts ? (<><span className="font-mono text-muted-foreground/60">{parts[1]}</span> <span className="text-foreground/80">{parts[2]}</span></>) : log}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>
            </div>
        </div>
    )
}
