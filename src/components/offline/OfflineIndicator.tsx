"use client"

import { useState, useEffect } from "react"
import { Wifi, WifiOff, Download, Check, Loader2 } from "lucide-react"

/**
 * Compact offline status indicator.
 * Shows current connectivity state. Appears only when offline or when
 * a bulk download is in progress.
 */
export function OfflineIndicator() {
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
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-amber-500/90 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm">
            <WifiOff className="h-3.5 w-3.5" />
            <span>Offline — using cached data</span>
        </div>
    )
}

/**
 * Download button for making a setlist available offline.
 * Shows progress during download, checkmark when complete.
 */
export function OfflineDownloadButton({
    isFullyOffline,
    isDownloading,
    progress,
    onDownload,
}: {
    isFullyOffline: boolean
    isDownloading: boolean
    progress?: { current: number; total: number } | null
    onDownload: () => void
}) {
    if (isFullyOffline) {
        return (
            <button
                className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 px-2 py-1 rounded bg-green-500/10"
                disabled
            >
                <Check className="h-3 w-3" />
                Available offline
            </button>
        )
    }

    if (isDownloading && progress) {
        return (
            <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 rounded bg-accent"
                disabled
            >
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress.current}/{progress.total}
            </button>
        )
    }

    return (
        <button
            onClick={onDownload}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
            title="Download all charts for offline use"
        >
            <Download className="h-3 w-3" />
            Save offline
        </button>
    )
}
