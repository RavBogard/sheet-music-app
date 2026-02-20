"use client"

import { useState } from "react"
import { Trash2, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"

export function OrphanedFilePruner() {
    const [status, setStatus] = useState<"idle" | "scanning" | "pruning" | "done">("idle")
    const [stats, setStats] = useState<{ scanned: number, pruned: number } | null>(null)

    const handlePrune = async () => {
        if (!confirm("Are you sure you want to scan and remove orphaned file references from all setlists? This relies on your cached Drive files. Ensure a library sync has been run recently. This cannot be undone.")) return

        setStatus("scanning")
        try {
            const res = await apiFetch("/api/admin/prune-orphans", { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setStats({ scanned: data.setlistsScanned, pruned: data.tracksPruned })
            setStatus("done")
            toast.success(`Pruned ${data.tracksPruned} missing references from ${data.setlistsScanned} setlists.`)
            setTimeout(() => setStatus("idle"), 5000)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to prune orphans")
            setStatus("idle")
        }
    }

    return (
        <div className="bg-card border border-border p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-500" />
                    Clean Orphaned References
                </h4>
                <p className="text-xs text-muted-foreground w-full sm:max-w-xs">
                    Scan all setlists and automatically unlink missing Google Drive files that were hard-deleted or otherwise orphaned.
                </p>
                {status === "done" && stats && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3" /> Scanned {stats.scanned} setlists. Removed {stats.pruned} links.
                    </p>
                )}
            </div>

            <button
                onClick={handlePrune}
                disabled={status !== "idle"}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${status === "idle"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20"
                        : "bg-muted text-muted-foreground border-border cursor-not-allowed"
                    }`}
            >
                {status === "scanning" || status === "pruning" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                ) : status === "done" ? (
                    <><CheckCircle2 className="w-4 h-4" /> Finished</>
                ) : (
                    <><AlertTriangle className="w-4 h-4" /> Scrub Database</>
                )}
            </button>
        </div>
    )
}
