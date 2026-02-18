"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"

/**
 * Thin offline indicator for performance mode.
 * Shows at the top of the screen when the connection drops.
 * Reassures musicians their charts are loading from cache.
 * Auto-hides 3 seconds after connection restores.
 */
export function PerformanceOfflineIndicator() {
    const [isOnline, setIsOnline] = useState(true)
    const [showReconnected, setShowReconnected] = useState(false)

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

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (isOnline && !showReconnected) return null

    return (
        <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2
            py-1 text-xs font-medium transition-colors duration-300
            ${!isOnline
                ? "bg-amber-600/80 text-white backdrop-blur-sm"
                : "bg-green-600/80 text-white backdrop-blur-sm"
            }`}
        >
            {!isOnline ? (
                <>
                    <WifiOff className="h-3 w-3" />
                    <span>Offline · charts from cache</span>
                </>
            ) : (
                <>
                    <Wifi className="h-3 w-3" />
                    <span>Back online</span>
                </>
            )}
        </div>
    )
}
