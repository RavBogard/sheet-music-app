"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { CollapsibleSection } from "@/components/admin/CollapsibleSection"
import { SyncStats } from "@/lib/sync-engine"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
    Loader2, Database, Repeat, CheckCircle,
    ShieldCheck, AlertTriangle,
} from "lucide-react"

interface GhostFile {
    id: string
    name: string
    mimeType: string
    lastSyncedAt: string
}

export function LibraryDataSection() {
    const { user } = useAuth()

    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)
    const [enriching, setEnriching] = useState(false)
    const [enrichStats, setEnrichStats] = useState<{
        processed?: number; enriched?: number; success?: number;
        enrichedFiles?: string[]; failedFiles?: string[]
    } | null>(null)
    const [failedEnrichCount, setFailedEnrichCount] = useState(0)
    const [resettingFailures, setResettingFailures] = useState(false)
    const [clearingChords, setClearingChords] = useState(false)
    const [migrating, setMigrating] = useState(false)
    const [migrationStatus, setMigrationStatus] = useState<{
        total: number; inStorage: number; failed: number; pending: number;
        percentComplete: number; failedFiles?: { name: string; id: string; error: string }[]
    } | null>(null)
    const [migrationProgress, setMigrationProgress] = useState<{
        succeeded: number; failed: number; remaining: number; phase: string; message: string
    } | null>(null)
    const [pruneLoading, setPruneLoading] = useState(false)
    const [pruneScanData, setPruneScanData] = useState<{
        driveCount: number; dbCount: number; ghosts: GhostFile[]; prunedCount?: number
    } | null>(null)

    // Load chronic enrichment failure count
    useEffect(() => {
        if (!user) return
        apiFetch("/api/admin/enrich/failures")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setFailedEnrichCount(data.count) })
            .catch(() => {})
    }, [user?.uid])

    const handleResetFailures = async () => {
        setResettingFailures(true)
        try {
            const res = await apiFetch("/api/admin/enrich/failures", { method: "DELETE" })
            const data = await res.json()
            if (res.ok) {
                toast.success(data.message)
                setFailedEnrichCount(0)
            }
        } catch { toast.error("Reset failed") }
        finally { setResettingFailures(false) }
    }

    const handleSync = async () => {
        setSyncing(true); setLastStats(null)
        try {
            const res = await apiFetch("/api/library/sync", { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            setLastStats((await res.json()).stats)
            toast.success("Library sync complete!")
        } catch (e: unknown) { toast.error("Sync failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setSyncing(false) }
    }

    const handleEnrich = async () => {
        setEnriching(true); setEnrichStats(null)
        try {
            const res = await apiFetch("/api/admin/enrich", { method: "POST" })
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
            const res = await apiFetch("/api/admin/migrate-storage/reset", { method: "DELETE" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed")
            toast.success(`Cleared ${data.cleared} cached chord scans.`)
        } catch (e: unknown) { toast.error("Failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setClearingChords(false) }
    }

    const fetchMigrationStatus = async () => {
        try {
            const res = await apiFetch("/api/admin/migrate-storage")
            if (res.ok) {
                const data = await res.json()
                setMigrationStatus(data)
            }
        } catch { /* silent */ }
    }

    // Load migration status on mount
    useEffect(() => { fetchMigrationStatus() }, [])

    const handleMigration = async (retryFailed = false, fullReset = false) => {
        setMigrating(true)
        setMigrationProgress(null)
        let totalSucceeded = 0, totalFailed = 0

        try {
            // Full reset: clear all migration markers first
            if (fullReset) {
                toast.loading("Resetting migration markers...")
                const resetRes = await apiFetch("/api/admin/migrate-storage/reset", { method: "POST" })
                if (!resetRes.ok) {
                    const data = await resetRes.json().catch(() => ({ error: "Reset failed" }))
                    throw new Error(data.error || "Reset failed")
                }
                const resetData = await resetRes.json()
                toast.dismiss()
                toast.info(`Reset ${resetData.cleared} files. Starting migration...`)
                // Refresh status to show 0%
                await fetchMigrationStatus()
                // Small delay to let Firestore settle
                await new Promise(r => setTimeout(r, 1000))
            }

            let remaining = Infinity, rounds = 0
            const maxRounds = 50 // 50 × 20 = 1000 files max
            const params = retryFailed || fullReset ? '?retryFailed=true&verify=true' : '?verify=true'
            while (remaining > 0 && rounds < maxRounds) {
                rounds++
                let res: Response
                try {
                    res = await apiFetch(`/api/admin/migrate-storage${params}`, { method: "POST" })
                } catch {
                    // Network hiccup — wait and retry once
                    await new Promise(r => setTimeout(r, 3000))
                    try { res = await apiFetch(`/api/admin/migrate-storage${params}`, { method: "POST" }) }
                    catch { toast.error("Network error — migration paused. You can resume by clicking the button again."); break }
                }
                const data = await res!.json()
                if (!res!.ok) { toast.error(data.error || "Batch failed"); break }
                totalSucceeded += data.succeeded || 0
                totalFailed += data.failed || 0
                remaining = data.remaining || 0
                setMigrationProgress({
                    succeeded: totalSucceeded,
                    failed: totalFailed,
                    remaining,
                    phase: data.phase,
                    message: `${totalSucceeded} migrated${totalFailed > 0 ? `, ${totalFailed} failed` : ''}, ${remaining} remaining`,
                })
                if (data.processed === 0) break
                // Small delay between batches to avoid hammering
                if (remaining > 0) await new Promise(r => setTimeout(r, 500))
            }
            if (remaining <= 0 && totalFailed === 0) {
                toast.success(`Migration complete! All ${totalSucceeded} files verified in Firebase Storage.`)
            } else if (remaining <= 0) {
                toast.warning(`Migration done: ${totalSucceeded} succeeded, ${totalFailed} failed. Use "Retry Failed" to address failures.`)
            } else {
                toast.info(`Paused: ${totalSucceeded} migrated, ${remaining} remaining. Click again to continue.`)
            }
            // Refresh status
            await fetchMigrationStatus()
        } catch (e: unknown) { toast.error("Migration failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setMigrating(false) }
    }

    const handleScanAndPrune = async () => {
        setPruneLoading(true); setPruneScanData(null)
        try {
            const scanRes = await apiFetch("/api/admin/prune/scan", { method: "POST" })
            if (!scanRes.ok) throw new Error(await scanRes.text())
            const data = await scanRes.json()
            if (data.ghostCount === 0) {
                setPruneScanData(data); toast.success("System clean.")
            } else {
                toast.loading(`Pruning ${data.ghostCount} ghost files...`)
                const pruneRes = await apiFetch("/api/admin/prune/execute", {
                    method: "POST",
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

    return (
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
                        <div className="p-2 bg-muted/50 rounded-lg text-xs border border-border space-y-1">
                            <span className="text-green-500 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Done</span>
                            <span className="text-muted-foreground">Scanned: {lastStats.totalScanned} · New: {lastStats.added} · Updated: {lastStats.updated}</span>
                            {(lastStats.addedFiles?.length || lastStats.deletedFiles?.length) ? (
                                <details className="mt-1">
                                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground text-[10px]">What changed?</summary>
                                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                                        {lastStats.addedFiles?.map((f, i) => (
                                            <div key={`a${i}`} className="text-green-500">+ {f}</div>
                                        ))}
                                        {lastStats.deletedFiles?.map((f, i) => (
                                            <div key={`d${i}`} className="text-red-400">− {f}</div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                        </div>
                    )}
                </div>

                {/* AI Enrichment */}
                <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                    <h3 className="font-semibold text-foreground text-sm">AI Enrichment</h3>
                    <p className="text-xs text-muted-foreground">Extract keys, BPM, metadata from PDFs</p>
                    {failedEnrichCount > 0 && (
                        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="text-red-400 flex-1">{failedEnrichCount} file{failedEnrichCount !== 1 ? 's' : ''} failed enrichment (skipped after 3 attempts)</span>
                            <Button onClick={handleResetFailures} disabled={resettingFailures} variant="outline" size="sm" className="text-[10px] h-6 px-2">
                                {resettingFailures ? "Resetting..." : "Reset & Retry"}
                            </Button>
                        </div>
                    )}
                    <Button onClick={handleEnrich} disabled={enriching} className="w-full gap-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl" size="sm">
                        <Repeat className={`w-3 h-3 ${enriching ? "animate-spin" : ""}`} />
                        {enriching ? "Enriching..." : "Run Enrichment"}
                    </Button>
                    {enrichStats && (
                        <div className="p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground border border-border space-y-1">
                            <div>Processed: {enrichStats.processed || enrichStats.success || 0} · Enriched: {enrichStats.enriched || enrichStats.success || 0}</div>
                            {enrichStats.enrichedFiles && enrichStats.enrichedFiles.length > 0 && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-violet-500 hover:text-violet-400">
                                        What changed? ({enrichStats.enrichedFiles.length} files)
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 pl-3 text-muted-foreground max-h-32 overflow-y-auto">
                                        {enrichStats.enrichedFiles.map((f, i) => (
                                            <li key={i} className="truncate">✓ {f}</li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {enrichStats.failedFiles && enrichStats.failedFiles.length > 0 && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-red-400">
                                        Failed ({enrichStats.failedFiles.length})
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 pl-3 text-red-400/80 max-h-32 overflow-y-auto">
                                        {enrichStats.failedFiles.map((f, i) => (
                                            <li key={i} className="truncate">✗ {f}</li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}
                </div>

                {/* Firebase Migration */}
                <div className="bg-card border border-border p-5 rounded-xl space-y-3">
                    <h3 className="font-semibold text-foreground text-sm">Firebase Storage</h3>
                    <p className="text-xs text-muted-foreground">Copy files from Drive → Firebase Storage CDN for fast, reliable serving.</p>

                    {/* Current status */}
                    {migrationStatus && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{migrationStatus.inStorage} / {migrationStatus.total} files in Storage</span>
                                <span className="font-mono">{migrationStatus.percentComplete}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        migrationStatus.percentComplete === 100 ? 'bg-green-500' : 'bg-orange-500'
                                    }`}
                                    style={{ width: `${migrationStatus.percentComplete}%` }}
                                />
                            </div>
                            {migrationStatus.pending > 0 && (
                                <p className="text-xs text-orange-500">{migrationStatus.pending} files not yet migrated</p>
                            )}
                            {migrationStatus.failed > 0 && (
                                <details className="text-xs">
                                    <summary className="text-red-500 cursor-pointer hover:text-red-400">
                                        {migrationStatus.failed} files failed previously
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 pl-3 text-red-400/80 max-h-32 overflow-y-auto">
                                        {migrationStatus.failedFiles?.map((f, i) => (
                                            <li key={i} className="truncate">{f.name}: {f.error}</li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2">
                        {/* Primary: Migrate new files */}
                        <Button
                            onClick={() => handleMigration(false, false)}
                            disabled={migrating}
                            className="w-full gap-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl"
                            size="sm"
                        >
                            <Repeat className={`w-3 h-3 ${migrating ? "animate-spin" : ""}`} />
                            {migrating ? "Migrating..." : "Migrate Pending Files"}
                        </Button>

                        {/* Secondary row */}
                        <div className="flex gap-2">
                            {/* Full reset & migrate */}
                            <Button
                                onClick={() => {
                                    if (confirm("This will reset ALL migration markers and re-copy every file from Drive to Firebase Storage. This may take several minutes. Continue?")) {
                                        handleMigration(true, true)
                                    }
                                }}
                                disabled={migrating}
                                variant="outline"
                                className="flex-1 gap-2 rounded-xl text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
                                size="sm"
                            >
                                <AlertTriangle className="w-3 h-3" />
                                Full Reset & Migrate All
                            </Button>

                            {/* Retry failed */}
                            {migrationStatus && migrationStatus.failed > 0 && (
                                <Button
                                    onClick={() => handleMigration(true, false)}
                                    disabled={migrating}
                                    variant="outline"
                                    className="gap-2 rounded-xl text-orange-600 border-orange-300"
                                    size="sm"
                                >
                                    Retry Failed
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Progress during migration */}
                    {migrationProgress && (
                        <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-2 border border-border">
                            <div className={`flex items-center gap-1.5 font-semibold ${
                                migrationProgress.phase === 'complete' ? "text-green-500" : "text-orange-500"
                            }`}>
                                {migrationProgress.phase === 'complete'
                                    ? <CheckCircle className="w-3.5 h-3.5" />
                                    : <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                }
                                {migrationProgress.phase === 'complete' ? "Migration Complete" : "Migrating..."}
                            </div>
                            <p className="text-muted-foreground">{migrationProgress.message}</p>
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
    )
}
