/**
 * New Song Detector
 *
 * Server-side utility that detects which songs in a setlist are "new"
 * for a given musician — i.e., the musician has never been assigned to
 * a setlist containing that song (matched by fileId).
 *
 * Used by the scheduling assign route to enrich assignment notifications.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { logger } from '@/lib/logger'

export interface TrackRef {
    fileId?: string
    title: string
}

/**
 * Detect which songs in the current setlist are "new" for a given musician.
 * "New" = the musician has no confirmed or pending assignment to a setlist
 * containing that fileId.
 *
 * Returns the subset of currentTracks whose fileId the musician has never seen.
 * Tracks without fileId (readings, prayers, dividers) are excluded.
 */
export async function detectNewSongs(
    db: Firestore,
    musicianUid: string,
    currentTracks: TrackRef[],
): Promise<TrackRef[]> {
    // Only consider tracks that have a linked PDF/file
    const tracksWithFile = currentTracks.filter(t => t.fileId)
    if (tracksWithFile.length === 0) return []

    try {
        // 1. Get musician's historical assignments
        const assignmentsSnap = await db.collection('scheduling_assignments')
            .where('musicianUid', '==', musicianUid)
            .where('status', 'in', ['confirmed', 'pending'])
            .orderBy('assignedAt', 'desc')
            .limit(50)
            .get()

        if (assignmentsSnap.empty) {
            // No history — everything is new
            return tracksWithFile
        }

        // 2. Collect unique historical setlist IDs
        const historicalSetlistIds = [...new Set(
            assignmentsSnap.docs.map(d => d.data().setlistId as string)
        )]

        // 3. Fetch historical setlists in parallel, chunked to avoid hitting limits
        const CHUNK_SIZE = 10
        const seenFileIds = new Set<string>()

        for (let i = 0; i < historicalSetlistIds.length; i += CHUNK_SIZE) {
            const chunk = historicalSetlistIds.slice(i, i + CHUNK_SIZE)
            const setlistDocs = await Promise.all(
                chunk.map(id => db.collection('setlists').doc(id).get())
            )
            setlistDocs.forEach(snap => {
                if (!snap.exists) return
                const tracks: TrackRef[] = snap.data()?.tracks ?? []
                tracks.forEach(t => {
                    if (t.fileId) seenFileIds.add(t.fileId)
                })
            })
        }

        // 4. Return tracks the musician has not seen before
        return tracksWithFile.filter(t => !seenFileIds.has(t.fileId!))
    } catch (err) {
        logger.warn(`[NewSongDetector] Failed for ${musicianUid}:`, err)
        return [] // Graceful degradation — don't block assignment
    }
}
