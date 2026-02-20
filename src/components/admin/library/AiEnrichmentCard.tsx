"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Repeat, AlertTriangle } from "lucide-react"

export function AiEnrichmentCard() {
    const { user } = useAuth()
    const [enriching, setEnriching] = useState(false)
    const [enrichStats, setEnrichStats] = useState<{
        processed?: number; enriched?: number; success?: number;
        enrichedFiles?: string[]; failedFiles?: string[]
    } | null>(null)
    const [failedEnrichCount, setFailedEnrichCount] = useState(0)
    const [resettingFailures, setResettingFailures] = useState(false)

    useEffect(() => {
        if (!user) return
        apiFetch("/api/admin/enrich/failures")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setFailedEnrichCount(data.count) })
            .catch(() => { })
    }, [user])

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

    return (
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
    )
}
