"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import { isFileCached } from '@/lib/cache-utils'
import { SetlistTrack } from '@/types/models'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

/**
 * Unified offline hook.
 * 
 * Combines the old useOfflineManager (bulk download) and useOfflineSync
 * (per-track status) into a single hook backed by the Browser Cache API.
 */
export function useOffline() {
    const [downloading, setDownloading] = useState<Record<string, boolean>>({})
    const [offlineStatus, setOfflineStatus] = useState<Record<string, boolean>>({})
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

    /** Check offline status for all tracks in a setlist */
    const checkOfflineStatus = useCallback(async (tracks: SetlistTrack[]) => {
        const status: Record<string, boolean> = {}
        for (const track of tracks) {
            if (track.fileId) {
                status[track.fileId] = await isFileCached(track.fileId)
            }
            if (track.audioFileId) {
                status[track.audioFileId] = await isFileCached(track.audioFileId)
            }
        }
        setOfflineStatus(status)
        return status
    }, [])

    /** Download a single file to IndexedDB */
    const downloadingRef = useRef(downloading)
    downloadingRef.current = downloading
    const controllersRef = useRef<Map<string, AbortController>>(new Map())

    // Abort all in-progress downloads on unmount
    useEffect(() => {
        return () => {
            for (const controller of controllersRef.current.values()) {
                controller.abort()
            }
            controllersRef.current.clear()
        }
    }, [])

    const downloadFile = useCallback(async (fileId: string, fileName: string) => {
        if (downloadingRef.current[fileId]) return

        const controller = new AbortController()
        controllersRef.current.set(fileId, controller)

        setDownloading(prev => ({ ...prev, [fileId]: true }))
        try {
            const res = await fetch(`/api/drive/file/${fileId}`, { signal: controller.signal })
            if (!res.ok) throw new Error('Download failed')

            if (!controller.signal.aborted) {
                setOfflineStatus(prev => ({ ...prev, [fileId]: true }))
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                logger.error(`Failed to download ${fileName}:`, error)
            }
        } finally {
            controllersRef.current.delete(fileId)
            if (!controller.signal.aborted) {
                setDownloading(prev => ({ ...prev, [fileId]: false }))
            }
        }
    }, [])

    /** Bulk download all files in a setlist to cache.
     *  Pass `silent: true` to suppress toast notifications (e.g., for background sync). */
    const downloadSetlist = useCallback(async (tracks: SetlistTrack[], options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false
        const filesToDownload: Array<{ id: string; name: string }> = []

        for (const track of tracks) {
            if (track.fileId && !(await isFileCached(track.fileId))) {
                filesToDownload.push({ id: track.fileId, name: track.title })
            }
            if (track.audioFileId && !(await isFileCached(track.audioFileId))) {
                filesToDownload.push({ id: track.audioFileId, name: `${track.title} (Audio)` })
            }
        }

        if (filesToDownload.length === 0) {
            if (!silent) toast.success('Already available offline')
            return
        }

        if (!silent) setBulkProgress({ current: 0, total: filesToDownload.length })

        let completed = 0
        for (const file of filesToDownload) {
            try {
                const res = await fetch(`/api/drive/file/${file.id}`)
                if (res.ok) {
                    setOfflineStatus(prev => ({ ...prev, [file.id]: true }))
                }
            } catch (e) {
                logger.error(`[Offline] Failed to cache ${file.name}:`, e)
            }
            completed++
            if (!silent) setBulkProgress({ current: completed, total: filesToDownload.length })
        }

        if (!silent) {
            setBulkProgress(null)
            toast.success(`${completed} files saved for offline use`)
        }
    }, [])

    /** Get a cached file blob (returns null if not cached) */
    const getCachedFile = useCallback(async (fileId: string) => {
        try {
            const res = await fetch(`/api/drive/file/${fileId}`, { cache: "only-if-cached" })
            if (res.ok) return await res.blob()
        } catch { }
        return null
    }, [])

    // Computed
    const isDownloading = bulkProgress !== null || Object.values(downloading).some(Boolean)

    return {
        // Status
        offlineStatus,
        checkOfflineStatus,
        isDownloading,
        bulkProgress,
        // Actions
        downloadFile,
        downloadSetlist,
        getCachedFile,
        // Per-file downloading state
        downloading,
    }
}
