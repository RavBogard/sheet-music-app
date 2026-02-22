"use client"

import { useState } from "react"
import { Trash2, AlertTriangle, Loader2, CheckCircle2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"

export function OrphanedFilePruner() {
    const [status, setStatus] = useState<"idle" | "checking" | "cleaning" | "healthy" | "issues">("idle")
    const [stats, setStats] = useState<{ scanned: number, orphansFound: number } | null>(null)

    const handleCheck = async () => {
        setStatus("checking")
        try {
            const res = await apiFetch("/api/admin/prune-orphans?dryRun=true", { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()

            setStats({ scanned: data.setlistsScanned, orphansFound: data.tracksPruned })

            if (data.tracksPruned > 0) {
                setStatus("issues")
            } else {
                setStatus("healthy")
                setTimeout(() => setStatus("idle"), 10000)
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to check library health")
            setStatus("idle")
        }
    }

    const handlePrune = async () => {
        if (!confirm("Are you sure you want to remove these orphaned references? This cannot be undone.")) return

        setStatus("cleaning")
        try {
            const res = await apiFetch("/api/admin/prune-orphans", { method: "POST" })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()

            setStats({ scanned: data.setlistsScanned, orphansFound: 0 })
            setStatus("healthy")
            toast.success(`Fixed ${data.tracksPruned} missing references from ${data.setlistsScanned} setlists.`)
            setTimeout(() => setStatus("idle"), 8000)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to prune orphans")
            setStatus("issues")
        }
    }

    return (
        <div className="bg-card border border-border p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                    {status === "healthy" ? <ShieldCheck className="w-5 h-5 text-emerald-500" /> : <Trash2 className="w-5 h-5 text-muted-foreground" />}
                    Library Integrity Check
                </h4>
                <p className="text-xs text-muted-foreground w-full sm:max-w-xs">
                    Scan setlists to detect and optionally remove missing Google Drive files that were hard-deleted or no longer exist.
                </p>
                {status === "healthy" && stats && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1 bg-emerald-500/10 px-2 py-1 rounded inline-flex">
                        <CheckCircle2 className="w-3 h-3" /> Healthy: Scanned {stats.scanned} setlists. No broken links.
                    </p>
                )}
                {status === "issues" && stats && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-1 bg-amber-500/10 px-2 py-1 rounded inline-flex">
                        <AlertTriangle className="w-3 h-3" /> Warning: Found {stats.orphansFound} broken links across {stats.scanned} setlists.
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2">
                {status === "issues" && (
                    <button
                        onClick={handlePrune}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                    >
                        Fix {stats?.orphansFound} Issues
                    </button>
                )}

                <button
                    onClick={status === "cleaning" ? undefined : handleCheck}
                    disabled={status === "checking" || status === "cleaning"}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${status === "idle" || status === "healthy" || status === "issues"
                            ? "bg-background text-foreground border-border hover:bg-muted"
                            : "bg-muted text-muted-foreground border-border cursor-not-allowed"
                        }`}
                >
                    {status === "checking" || status === "cleaning" ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {status === "checking" ? "Scanning..." : "Fixing..."}</>
                    ) : (
                        "Analyze"
                    )}
                </button>
            </div>
        </div>
    )
}
