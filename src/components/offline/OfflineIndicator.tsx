"use client"

import { useState, useEffect } from "react"
import { WifiOff } from "lucide-react"
import { useT } from "@/i18n/client"

/**
 * Compact offline status indicator.
 * Shows current connectivity state. Appears only when offline or when
 * a bulk download is in progress.
 */
export function OfflineIndicator() {
    const t = useT()
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)

        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    // Only show when offline
    if (isOnline) return null

    return (
        <div className="fixed bottom-4 start-4 z-50 flex items-center gap-2 bg-caution text-caution-foreground px-3 py-1.5 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm">
            <WifiOff className="h-3.5 w-3.5" />
            <span>{t("offline.usingCachedData")}</span>
        </div>
    )
}
