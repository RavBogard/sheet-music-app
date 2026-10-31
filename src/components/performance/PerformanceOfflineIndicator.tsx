"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { listFileIds } from "@/lib/offline-idb"
import { logger } from "@/lib/logger"
import { useT } from "@/i18n/client"

interface Props {
    /** Song-track fileIds on the current setlist; used to report N/M offline-ready. */
    setlistFileIds?: string[]
}

/**
 * Thin offline indicator for performance mode.
 * When offline and given setlist fileIds, reports how many of those charts
 * are actually in IndexedDB (Phase 1.2 ground truth). Falls back to plain
 * OFFLINE MODE when no fileIds or IDB is unavailable.
 */
export function PerformanceOfflineIndicator({ setlistFileIds }: Props = {}) {
    const t = useT()
    const [isOnline, setIsOnline] = useState(true)
    const [showReconnected, setShowReconnected] = useState(false)
    const [readyCount, setReadyCount] = useState<number | null>(null)

    const total = setlistFileIds?.length ?? 0

    useEffect(() => {
        setIsOnline(navigator.onLine)

        const handleOnline = () => {
            setIsOnline(true)
            setShowReconnected(true)
            setTimeout(() => setShowReconnected(false), 3000)
        }
        const handleOffline = () => {
            setIsOnline(false)
            setShowReconnected(false)
        }

        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)
        return () => {
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
        }
    }, [])

    useEffect(() => {
        if (isOnline) return
        if (total === 0) {
            setReadyCount(null)
            return
        }
        let cancelled = false
        ;(async () => {
            try {
                const ids = await listFileIds()
                if (cancelled) return
                const want = new Set(setlistFileIds)
                let ready = 0
                for (const id of ids) if (want.has(id)) ready++
                setReadyCount(ready)
            } catch (e) {
                logger.warn("[PerformanceOfflineIndicator] listFileIds failed:", e)
                if (!cancelled) setReadyCount(null)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [isOnline, setlistFileIds, total])

    if (isOnline && !showReconnected) return null

    const showFraction = !isOnline && total > 0 && readyCount !== null

    return (
        <div className="fixed top-safe pt-2 inset-x-0 z-splash flex justify-center pointer-events-none">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors duration-500 shadow-[0_4px_16px_rgb(24_32_46/0.22)]
                ${!isOnline
                    ? "bg-section-ochre text-section-ochre-foreground"
                    : "bg-success text-success-foreground"
                }`}
            >
                {!isOnline ? (
                    <>
                        <WifiOff className="h-4 w-4" />
                        <span>
                            {showFraction
                                ? t("perform.offline.offlineChartsReady", { ready: readyCount, total })
                                : t("perform.offline.offlineMode")}
                        </span>
                    </>
                ) : (
                    <>
                        <Wifi className="h-4 w-4" />
                        <span>{t("perform.offline.reconnected")}</span>
                    </>
                )}
            </div>
        </div>
    )
}
