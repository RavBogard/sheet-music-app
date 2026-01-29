"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Trash2, CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

interface GhostFile {
    id: string
    name: string
    mimeType: string
    lastSyncedAt: string
}

export function PruneManager() {
    const { user } = useAuth()
    const [loading, setLoading] = useState(false)
    const [scanData, setScanData] = useState<{
        driveCount: number
        dbCount: number
        ghosts: GhostFile[]
    } | null>(null)

    const handleScanAndPrune = async () => {
        if (!user) return
        setLoading(true)
        setScanData(null)
        try {
            const token = await user.getIdToken()

            // 1. Scan
            const scanRes = await fetch('/api/admin/prune/scan', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!scanRes.ok) {
                const errText = await scanRes.text()
                throw new Error(errText || "Scan failed")
            }
            const data = await scanRes.json()

            if (data.ghostCount === 0) {
                setScanData(data)
                toast.success("System is clean. No ghost files found.")
            } else {
                // 2. Auto-Prune
                toast.loading(`Pruning ${data.ghostCount} ghost files...`)
                const pruneRes = await fetch('/api/admin/prune/execute', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ fileIds: data.ghosts.map((g: any) => g.id) })
                })

                if (!pruneRes.ok) throw new Error("Prune failed")
                const pruneData = await pruneRes.json()

                // Update local state to show zero ghosts but keep counts
                setScanData({
                    ...data,
                    ghosts: [], // Cleared
                    prunedCount: pruneData.deletedCount // Custom field for UI
                })
                toast.dismiss()
                toast.success(`Cleanup Complete: Removed ${pruneData.deletedCount} files.`)
            }

        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="border-orange-500/20 bg-orange-500/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-500">
                    <ShieldCheck className="h-5 w-5" />
                    Data Integrity Manager
                </CardTitle>
                <CardDescription>
                    Compare Database vs. Google Drive to find "Ghost Files" (deleted in Drive but still in App).
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                    <Button onClick={handleScanAndPrune} disabled={loading} variant="outline" className="border-orange-500/50 hover:bg-orange-500/10 text-orange-400">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Run Consistency Check"}
                    </Button>

                    {scanData && (
                        <div className="text-sm text-zinc-400 flex gap-4">
                            <span>Drive: <span className="text-white font-mono">{scanData.driveCount}</span></span>
                            <span>DB: <span className="text-white font-mono">{scanData.dbCount}</span></span>
                        </div>
                    )}
                </div>

                {/* Success State (Post-Prune or Clean Scan) */}
                {scanData && scanData.ghosts.length === 0 && (
                    <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-2 rounded">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">
                            {(scanData as any).prunedCount ?
                                `Cleanup Success: Removed ${(scanData as any).prunedCount} ghost files.` :
                                "System Clean. Database is in sync."
                            }
                        </span>
                    </div>
                )}

                {scanData && scanData.ghosts.length > 0 && (
                    <div className="bg-black/20 rounded-lg p-4 border border-red-500/20 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-red-400 font-bold flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                {scanData.ghosts.length} Ghosts Found
                            </h4>
                        </div>
                        <div className="max-h-32 overflow-y-auto text-xs text-zinc-500 space-y-1">
                            {scanData.ghosts.map(g => (
                                <div key={g.id} className="flex justify-between">
                                    <span className="truncate max-w-[200px]">{g.name}</span>
                                    <span className="font-mono opacity-50">{g.id}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
