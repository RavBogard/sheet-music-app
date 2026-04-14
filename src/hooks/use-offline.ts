"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import { SetlistTrack } from '@/types/models'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { getFile, hasFile, putFile } from '@/lib/offline-idb'

/**
 * Unified offline hook, backed by IndexedDB (via offline-idb).
 *
 * Ground truth for "is this file available offline." A file is offline iff
 * its blob is in IDB. Failed downloads do NOT mark it available.
 */
export function useOffline() {
    const [downloading, setDownloading] = useState<Record<string, boolean>>({})
    const [offlineStatus, setOfflineStatus] = useState<Record<string, boolean>>({})
    const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

    /** Check offline status for all tracks in a setlist */
    const checkOfflineStatus = useCallback(async (tracks: SetlistTrack[]) => {
        const status: Record<string, boolean> = {}
        for (const track of tracks) {
            if (track.fileId) status[track.fileId] = await hasFile(track.fileId)
            if (track.audioFileId) status[track.audioFileId] = await hasFile(track.audioFileId)
        }
        setOfflineStatus(status)
        return status
    }, [])

    const downloadingRef = useRef(downloading)
    downloadingRef.current = downloading
    const controllersRef = useRef<Map<string, AbortController>>(new Map())

    // Abort all in-progress downloads on unmount
    useEffect(() => {
        const controllers = controllersRef.current
        return () => {
            for (const controller of controllers.values()) controller.abort()
            controllers.clear()
        }
    }, [])

    /**
     * Fetch a file from the API and persist its blob to IDB. Returns true
     * iff the blob was written. Failed fetches do NOT update offlineStatus.
     */
    const fetchAndStore = useCallback(async (fileId: string, signal: AbortSignal): Promise<boolean> => {
        const res = await fetch(`/api/drive/file/${fileId}`, { signal })
        if (!res.ok) return false
        const blob = await res.blob()
        if (!blob || blob.size === 0) return false
        await putFile(fileId, blob)
        return true
    }, [])

    const downloadFile = useCallback(async (fileId: string, fileName: string) => {
        if (downloadingRef.current[fileId]) return

        const controller = new AbortController()
        controllersRef.current.set(fileId, controller)

        setDownloading(prev => ({ ...prev, [fileId]: true }))
        let stored = false
        try {
            stored = await fetchAndStore(fileId, controller.signal)
        } catch (error) {
            if (!controller.signal.aborted) {
                logger.error(`Failed to download ${fileName}:`, error)
            }
        } finally {
            controllersRef.current.delete(fileId)
            if (!controller.signal.aborted) {
                setDownloading(prev => ({ ...prev, [fileId]: false }))
                // Only set true when the blob actually made it into IDB.
                if (stored) setOfflineStatus(prev => ({ ...prev, [fileId]: true }))
            }
        }
    }, [fetchAndStore])

    /** Bulk download all files in a setlist.
     *  Pass `silent: true` to suppress toast notifications (e.g., for background sync). */
    const downloadSetlist = useCallback(async (tracks: SetlistTrack[], options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false
        const filesToDownload: Array<{ id: string; name: string }> = []

        for (const track of tracks) {
            if (track.fileId && !(await hasFile(track.fileId))) {
                filesToDownload.push({ id: track.fileId, name: track.title })
            }
            if (track.audioFileId && !(await hasFile(track.audioFileId))) {
                filesToDownload.push({ id: track.audioFileId, name: `${track.title} (Audio)` })
            }
        }

        if (filesToDownload.length === 0) {
            if (!silent) toast.success('Already available offline')
            return
        }

        if (!silent) setBulkProgress({ current: 0, total: filesToDownload.length })

        const controller = new AbortController()
        let succeeded = 0
        let failed = 0
        for (const file of filesToDownload) {
            try {
                const stored = await fetchAndStore(file.id, controller.signal)
                if (stored) {
                    succeeded++
                    setOfflineStatus(prev => ({ ...prev, [file.id]: true }))
                } else {
                    failed++
                }
            } catch (e) {
                failed++
                logger.error(`[Offline] Failed to cache ${file.name}:`, e)
            }
            if (!silent) setBulkProgress({ current: succeeded + failed, total: filesToDownload.length })
        }

        if (!silent) {
            setBulkProgress(null)
            if (succeeded === 0) {
                toast.error('Could not save any files for offline use')
            } else if (failed > 0) {
                toast.warning(`${succeeded} of ${filesToDownload.length} files saved — ${failed} failed`)
            } else {
                toast.success(`${succeeded} files saved for offline use`)
            }
        }
    }, [fetchAndStore])

    /** Get a cached file blob (returns null if not cached) */
    const getCachedFile = useCallback(async (fileId: string) => {
        return getFile(fileId)
    }, [])

    // Computed
    const isDownloading = bulkProgress !== null || Object.values(downloading).some(Boolean)

    return {
        offlineStatus,
        checkOfflineStatus,
        isDownloading,
        bulkProgress,
        downloadFile,
        downloadSetlist,
        getCachedFile,
        downloading,
    }
}
