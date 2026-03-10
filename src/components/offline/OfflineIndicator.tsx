"use client"

import { useState, useEffect } from "react"
import { WifiOff, Download, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

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
            <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-green-600 dark:text-green-400 bg-green-500/10"
                disabled
            >
                <Check className="h-3 w-3" />
                Available offline
            </Button>
        )
    }

    if (isDownloading && progress) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground bg-accent"
                disabled
            >
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress.current}/{progress.total}
            </Button>
        )
    }

    return (
        <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onDownload}
            className="text-muted-foreground hover:text-foreground"
            title="Download all charts for offline use"
        >
            <Download className="h-3 w-3" />
            Save offline
        </Button>
    )
}
