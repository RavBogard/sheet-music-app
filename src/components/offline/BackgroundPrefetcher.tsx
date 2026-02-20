"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from "firebase/firestore"
import { isFileOffline, saveOfflineFile, evictStaleFiles } from "@/lib/offline-store"
import { logger } from "@/lib/logger"

/**
 * Background pre-cacher.
 * 
 * On app load, fetches the next 2 upcoming public setlists and
 * silently downloads any un-cached PDFs. This ensures musicians
 * always have the next service's charts ready offline.
 * 
 * Runs once per session (tracked via ref). All downloads are
 * sequential and low-priority to avoid impacting the UI.
 */
export function BackgroundPrefetcher() {
    const { user, isMember } = useAuth()
    const hasRun = useRef(false)

    useEffect(() => {
        if (!user || !isMember || hasRun.current) return
        hasRun.current = true

        // Delay significantly to avoid competing with initial page load.
        // On slow networks, skip entirely (user is likely on limited data).
        const timer = setTimeout(() => {
            // Skip on slow networks or data-saver mode
            const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
            if (conn && (conn.saveData || conn.effectiveType === '2g')) return

            const startPrefetch = () => {
                prefetchUpcomingSetlists()
                    .then(() => evictStaleFiles(60))
                    .catch(() => {/* silent */})
            }

            // Use requestIdleCallback when available so prefetching
            // only runs when the browser is idle (no user interaction)
            if ('requestIdleCallback' in window) {
                requestIdleCallback(startPrefetch, { timeout: 30000 })
            } else {
                startPrefetch()
            }
        }, 15000)

        return () => clearTimeout(timer)
     
    }, [user?.uid, isMember])

    return null // No UI
}

async function prefetchUpcomingSetlists() {
    try {
        const now = Timestamp.now()
        const q = query(
            collection(db, 'setlists'),
            where('isPublic', '==', true),
            where('eventDate', '>=', now),
            orderBy('eventDate', 'asc'),
            limit(2)
        )

        const snapshot = await getDocs(q)
        if (snapshot.empty) return

        let cached = 0
        for (const doc of snapshot.docs) {
            const data = doc.data()
            const tracks = data.tracks || []

            for (const track of tracks) {
                if (!track.fileId) continue

                const alreadyCached = await isFileOffline(track.fileId)
                if (alreadyCached) continue

                try {
                    const res = await fetch(`/api/drive/file/${track.fileId}`)
                    if (res.ok) {
                        const blob = await res.blob()
                        const mimeType = res.headers.get('Content-Type') || 'application/pdf'
                        await saveOfflineFile(track.fileId, blob, track.title || 'chart', mimeType)
                        cached++
                    }
                } catch {
                    // Silent — don't disrupt the user
                }

                // Small delay between downloads to avoid flooding
                await new Promise(r => setTimeout(r, 200))
            }
        }

        if (cached > 0) {
            logger.info(`[Prefetch] Cached ${cached} charts from upcoming setlists`)
        }
    } catch (err) {
        logger.warn('[Prefetch] Failed:', err)
    }
}
