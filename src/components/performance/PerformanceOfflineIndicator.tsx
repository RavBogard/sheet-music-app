"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { listFileIds } from "@/lib/offline-idb"
import { logger } from "@/lib/logger"

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
        <div className="fixed top-safe pt-2 left-0 right-0 z-splash flex justify-center pointer-events-none">
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all duration-500 shadow-xl
                ${!isOnline
                    ? "glass border-amber-500/30 text-amber-200"
                    : "glass border-green-500/30 text-green-200"
                }`}
            >
                {!isOnline ? (
                    <>
                        <WifiOff className="h-3.5 w-3.5" />
                        <span>
                            {showFraction
                                ? `OFFLINE \u2014 ${readyCount}/${total} CHARTS READY`
                                : "OFFLINE MODE"}
                        </span>
                    </>
                ) : (
                    <>
                        <Wifi className="h-3.5 w-3.5" />
                        <span>RECONNECTED</span>
                    </>
                )}
            </div>
        </div>
    )
}
