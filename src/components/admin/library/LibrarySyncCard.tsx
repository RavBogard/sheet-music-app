"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { SyncStats } from "@/lib/sync-engine"
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
    )
}
