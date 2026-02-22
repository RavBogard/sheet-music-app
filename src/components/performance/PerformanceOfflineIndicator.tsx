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
    return (
        <div className="fixed top-safe pt-2 left-0 right-0 z-[100] flex justify-center pointer-events-none">
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all duration-500 shadow-xl
                ${!isOnline
                    ? "glass border-amber-500/30 text-amber-200"
                    : "glass border-green-500/30 text-green-200"
                }`}
            >
                {!isOnline ? (
                    <>
                        <WifiOff className="h-3.5 w-3.5" />
                        <span>OFFLINE MODE</span>
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
    )
}
