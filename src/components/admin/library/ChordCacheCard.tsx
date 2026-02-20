"use client"

import { useState } from "react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Repeat } from "lucide-react"

export function ChordCacheCard() {
    const [clearingChords, setClearingChords] = useState(false)

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

    return (
        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground text-sm">Chord Cache</h3>
            <p className="text-xs text-muted-foreground">Clear cached chords so charts rescan</p>
            <Button onClick={handleClearChordCache} disabled={clearingChords} variant="outline" className="w-full gap-2 rounded-xl" size="sm">
                <Repeat className={`w-3 h-3 ${clearingChords ? "animate-spin" : ""}`} />
                {clearingChords ? "Clearing..." : "Clear Chord Cache"}
            </Button>
        </div>
    )
}
