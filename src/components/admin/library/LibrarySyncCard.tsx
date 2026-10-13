"use client"

import { useState, useRef, useEffect } from "react"
import { apiFetch } from "@/lib/api-client"
import { clearLibraryCache, broadcastCacheInvalidation } from "@/lib/library-cache"
import { SyncStats } from "@/lib/sync-engine"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Repeat, CheckCircle } from "lucide-react"
import { useT } from "@/i18n/client"

export function LibrarySyncCard() {
    const t = useT()
    const [syncing, setSyncing] = useState(false)
    const [lastStats, setLastStats] = useState<SyncStats | null>(null)
    const controllerRef = useRef<AbortController | null>(null)

    // Abort any in-flight sync when the card unmounts.
    useEffect(() => {
        return () => { controllerRef.current?.abort() }
    }, [])

    const handleSync = async () => {
        setSyncing(true)
        setLastStats(null)
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        try {
            const res = await apiFetch("/api/library/sync", { method: "POST", signal: controller.signal, timeout: 0 })
            if (controller.signal.aborted) return
            if (!res.ok) throw new Error(await res.text())
            const json = await res.json()
            if (controller.signal.aborted) return
            setLastStats(json.stats)
            // Invalidate local cache so next library load fetches fresh data
            await clearLibraryCache()
            if (controller.signal.aborted) return
            broadcastCacheInvalidation()
            toast.success(t("admin-library.syncComplete"))
        } catch (e: unknown) {
            if ((e as Error).name === 'AbortError') return
            toast.error(t("admin-library.syncFailed", { reason: e instanceof Error ? e.message : t("admin-library.syncFailedUnknown") }))
        } finally {
            if (!controller.signal.aborted) setSyncing(false)
        }
    }

    return (
        <div className="bg-card border border-border p-5 rounded-xl space-y-3">
            <h3 className="font-semibold text-foreground text-sm">{t("admin-library.syncTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("admin-library.syncSubtitle")}</p>
            <Button
                onClick={handleSync}
                disabled={syncing}
                className="w-full gap-2 rounded-xl min-h-11"
                size="sm"
            >
                <Repeat className={cn("w-4 h-4", syncing && "animate-spin")} />
                {syncing ? t("admin-library.syncing") : t("admin-library.syncNow")}
            </Button>
            {lastStats && (
                <div className="p-3 bg-muted/50 rounded-lg text-xs border border-border space-y-1">
                    <span className="text-success font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> {t("admin-library.syncDone")}
                    </span>
                    <span className="text-muted-foreground">
                        {t("admin-library.syncStats", { scanned: lastStats.totalScanned, added: lastStats.added, updated: lastStats.updated })}
                        {lastStats.copiedToStorage > 0 && t("admin-library.syncStatsCopied", { copied: lastStats.copiedToStorage })}
                    </span>
                    {lastStats.copyErrors > 0 && (
                        <div className="text-destructive space-y-0.5">
                            <div>{t("admin-library.syncCopyErrors", { count: lastStats.copyErrors })}</div>
                            {lastStats.copyFailedFiles?.map((name, i) => (
                                <div key={i} className="ps-3 text-[10px] text-destructive/80 truncate">{name}</div>
                            ))}
                        </div>
                    )}
                    {lastStats.addedFiles?.length ? (
                        <details className="mt-1">
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground text-[10px]">
                                {t("admin-library.syncWhatChanged")}
                            </summary>
                            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                                {lastStats.addedFiles?.map((f, i) => (
                                    <div key={`a${i}`} className="text-success">+ {f}</div>
                                ))}
                            </div>
                        </details>
                    ) : null}
                </div>
            )}
        </div>
    )
}
