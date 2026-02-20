"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Loader2, ShieldCheck, CheckCircle, AlertTriangle } from "lucide-react"

export interface GhostFile {
    id: string
    name: string
    mimeType: string
    lastSyncedAt: string
}

export function DataIntegrityCard() {
    const [pruneLoading, setPruneLoading] = useState(false)
    const [pruneScanData, setPruneScanData] = useState<{
        driveCount: number; dbCount: number; ghosts: GhostFile[]; prunedCount?: number
    } | null>(null)

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
                <div className="flex items-center gap-3 text-xs mt-2">
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
    )
}
