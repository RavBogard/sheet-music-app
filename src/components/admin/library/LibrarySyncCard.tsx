"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { clearLibraryCache, broadcastCacheInvalidation } from "@/lib/library-cache"
import { SyncStats } from "@/lib/sync-engine"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Repeat, CheckCircle } from "lucide-react"

export function LibrarySyncCard() {
    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)

    const handleSync = async () => {
        setSyncing(true)
        setLastStats(null)
        try {
            const res = await apiFetch("/api/library/sync", { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            setLastStats((await res.json()).stats)
            // Invalidate local cache so next library load fetches fresh data
            await clearLibraryCache()
            broadcastCacheInvalidation()
            toast.success("Library sync complete!")
        } catch (e: unknown) {
            toast.error("Sync failed: " + (e instanceof Error ? e.message : "Unknown"))
        } finally {
            setSyncing(false)
        }
    }

    return (
        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Library Sync</h3>
            <p className="text-xs text-muted-foreground">Sync Google Drive → library</p>
            <Button
                onClick={handleSync}
                disabled={syncing}
                className="w-full gap-2 rounded-xl min-h-11"
                size="sm"
            >
                <Repeat className={cn("w-4 h-4", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync Now"}
            </Button>
            {lastStats && (
                <div className="p-3 bg-muted/50 rounded-lg text-xs border border-border space-y-1">
                    <span className="text-success font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Done
                    </span>
                    <span className="text-muted-foreground">
                        Scanned: {lastStats.totalScanned} · New: {lastStats.added} · Updated: {lastStats.updated}
                        {lastStats.copiedToStorage > 0 && ` · Copied to Storage: ${lastStats.copiedToStorage}`}
                    </span>
                    {lastStats.copyErrors > 0 && (
                        <span className="text-destructive">
                            ⚠ {lastStats.copyErrors} file{lastStats.copyErrors > 1 ? 's' : ''} failed to copy — unavailable until next sync
                        </span>
                    )}
                    {(lastStats.addedFiles?.length || lastStats.deletedFiles?.length) ? (
                        <details className="mt-1">
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground text-[10px]">
                                What changed?
                            </summary>
                            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                                {lastStats.addedFiles?.map((f, i) => (
                                    <div key={`a${i}`} className="text-success">+ {f}</div>
                                ))}
                                {lastStats.deletedFiles?.map((f, i) => (
                                    <div key={`d${i}`} className="text-destructive">− {f}</div>
                                ))}
                            </div>
                        </details>
                    ) : null}
                </div>
            )}
        </div>
    )
}
