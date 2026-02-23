"use client"

import { useState, useEffect } from "react"
import { HardDrive, Trash2, Loader2, Database, FileMusic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getOfflineStats, clearAllOfflineData, formatBytes, type OfflineStats } from "@/lib/offline-manager"
import { toast } from "sonner"

/**
 * Settings section showing offline storage usage and clear cache button.
 * Part of the consolidated offline system (Feature 8).
 */
export function OfflineStorageSection() {
    const [stats, setStats] = useState<OfflineStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [clearing, setClearing] = useState(false)

    useEffect(() => {
        getOfflineStats()
            .then(setStats)
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const handleClear = async () => {
        setClearing(true)
        try {
            await clearAllOfflineData()
            const newStats = await getOfflineStats()
            setStats(newStats)
            toast.success("Offline cache cleared")
        } catch {
            toast.error("Failed to clear cache")
        } finally {
            setClearing(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Offline Storage</h3>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking storage...
                </div>
            ) : stats ? (
                <div className="space-y-3">
                    {/* Storage bar */}
                    <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>{formatBytes(stats.usageBytes)} used</span>
                            <span>{formatBytes(stats.quotaBytes)} quota</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-violet-500 rounded-full transition-all"
                                style={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <FileMusic className="w-3.5 h-3.5" />
                            <span>{stats.cachedFileCount} charts cached</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Database className="w-3.5 h-3.5" />
                            <span>Library index: {stats.libraryIndexCached ? 'cached' : 'not cached'}</span>
                        </div>
                    </div>

                    {/* Clear button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClear}
                        disabled={clearing}
                        className="gap-2"
                    >
                        {clearing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Clear offline cache
                    </Button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Unable to read storage info</p>
            )}
        </div>
    )
}
