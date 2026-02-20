"use client"

import { useState, useEffect } from "react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Repeat, Loader2, CheckCircle, AlertTriangle } from "lucide-react"

export function FirebaseMigrationCard() {
    const [migrating, setMigrating] = useState(false)
    const [migrationStatus, setMigrationStatus] = useState<{
        total: number; inStorage: number; failed: number; pending: number;
        percentComplete: number; failedFiles?: { name: string; id: string; error: string }[]
    } | null>(null)
    const [migrationProgress, setMigrationProgress] = useState<{
        succeeded: number; failed: number; remaining: number; phase: string; message: string
    } | null>(null)

    const fetchMigrationStatus = async () => {
        try {
            const res = await apiFetch("/api/admin/migrate-storage")
            if (res.ok) {
                const data = await res.json()
                setMigrationStatus(data)
            }
        } catch { /* silent */ }
    }

    useEffect(() => { fetchMigrationStatus() }, [])

    const handleMigration = async (retryFailed = false, fullReset = false) => {
        setMigrating(true)
        setMigrationProgress(null)
        let totalSucceeded = 0, totalFailed = 0

        try {
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
                await fetchMigrationStatus()
                await new Promise(r => setTimeout(r, 1000))
            }

            let remaining = Infinity, rounds = 0
            const maxRounds = 50
            const params = retryFailed || fullReset ? '?retryFailed=true&verify=true' : '?verify=true'

            while (remaining > 0 && rounds < maxRounds) {
                rounds++
                let res: Response
                try {
                    res = await apiFetch(`/api/admin/migrate-storage${params}`, { method: "POST" })
                } catch {
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
                if (remaining > 0) await new Promise(r => setTimeout(r, 500))
            }

            if (remaining <= 0 && totalFailed === 0) {
                toast.success(`Migration complete! All ${totalSucceeded} files verified in Firebase Storage.`)
            } else if (remaining <= 0) {
                toast.warning(`Migration done: ${totalSucceeded} succeeded, ${totalFailed} failed. Use "Retry Failed" to address failures.`)
            } else {
                toast.info(`Paused: ${totalSucceeded} migrated, ${remaining} remaining. Click again to continue.`)
            }
            await fetchMigrationStatus()
        } catch (e: unknown) { toast.error("Migration failed: " + (e instanceof Error ? e.message : "Unknown")) }
        finally { setMigrating(false) }
    }

    return (
        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Firebase Storage Migration</h3>
            <p className="text-xs text-muted-foreground">Copy files from Drive → Firebase Storage CDN for fast, reliable serving.</p>

            {migrationStatus && (
                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{migrationStatus.inStorage} / {migrationStatus.total} files in Storage</span>
                        <span className="font-mono">{migrationStatus.percentComplete}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${migrationStatus.percentComplete === 100 ? 'bg-green-500' : 'bg-orange-500'
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

            <div className="flex flex-col gap-2">
                <Button
                    onClick={() => handleMigration(false, false)}
                    disabled={migrating}
                    className="w-full gap-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl"
                    size="sm"
                >
                    <Repeat className={`w-3 h-3 ${migrating ? "animate-spin" : ""}`} />
                    {migrating ? "Migrating..." : "Migrate Pending Files"}
                </Button>

                <div className="flex gap-2">
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

            {migrationProgress && (
                <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-2 border border-border">
                    <div className={`flex items-center gap-1.5 font-semibold ${migrationProgress.phase === 'complete' ? "text-green-500" : "text-orange-500"
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
    )
}
