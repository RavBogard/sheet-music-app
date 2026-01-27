"use client"

import { useEffect, useState } from "react"
import { WifiOff, Wifi } from "lucide-react"

export function NetworkStatus() {
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        // Initial check
        setIsOnline(window.navigator.onLine)

        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (isOnline) return null

    return (
        <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium border border-red-500/20 animate-pulse">
            <WifiOff className="h-3 w-3" />
            <span>Offline</span>
        </div>
    )
}
