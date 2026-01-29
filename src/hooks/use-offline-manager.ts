"use client"

import { useState } from "react"
import { QueueItem } from "@/lib/store"
import { toast } from "sonner"

export function useOfflineManager() {
    const [isDownloading, setIsDownloading] = useState(false)
    const [progress, setProgress] = useState({ current: 0, total: 0 })

    const downloadSetlist = async (items: QueueItem[]) => {
        setIsDownloading(true)
        setProgress({ current: 0, total: items.length })

        try {
            // Open explicit cache
            const cache = await window.caches.open('sheet-music-offline_v1')

            let completed = 0

            // Sequential for safety, or batches
            for (const item of items) {
                try {
                    const url = `/api/drive/file/${item.fileId}`

                    // Check if already cached
                    const existing = await cache.match(url)
                    if (existing) {
                        console.log(`[Offline] ${item.name} already cached`)
                    } else {
                        console.log(`[Offline] Fetching ${item.name}...`)
                        // Fetch the actual PDF buffer
                        // Note: We need to ensure we fetch with Auth headers if this was a direct call, 
                        // but /api/drive/file checks cookies/headers. 
                        // The 'fetch' in cache.add might lose auth if strictly same-origin without creds.
                        // Better to explicitly fetch and put.

                        const res = await fetch(url)
                        if (res.ok) {
                            await cache.put(url, res.clone())
                        } else {
                            console.error(`Failed to fetch ${item.name}`)
                        }
                    }

                    // Also cache Audio if present
                    if (item.audioFileId) {
                        const audioUrl = `/api/drive/file/${item.audioFileId}`
                        if (!await cache.match(audioUrl)) {
                            const resAudio = await fetch(audioUrl)
                            if (resAudio.ok) await cache.put(audioUrl, resAudio.clone())
                        }
                    }

                } catch (e) {
                    console.error("Cache Error", e)
                }

                completed++
                setProgress(prev => ({ ...prev, current: completed }))
            }

            toast.success("Setlist Downloaded for Offline Use 🤘")

        } catch (e) {
            console.error("Offline Manager Error", e)
            toast.error("Failed to download offline")
        } finally {
            setIsDownloading(false)
        }
    }

    return {
        downloadSetlist,
        isDownloading,
        progress
    }
}
