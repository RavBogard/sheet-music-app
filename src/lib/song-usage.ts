/**
 * Song Usage Tracking
 *
 * Records which songs are used in published setlists, enabling:
 * - "Last played: Jan 31" badges in the library
 * - AI rotation awareness (avoid repeating songs too often)
 * - Future frequency analysis
 *
 * Firestore structure:
 *   songUsage/{fileId}              — summary doc (lastUsedDate, totalUses)
 *   songUsage/{fileId}/events/{id}  — individual usage events
 */

import { initAdmin, getFirestore } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from '@/lib/logger'

export interface SongUsageSummary {
    fileId: string
    lastUsedDate: Date
    lastUsedSetlistId: string
    lastUsedSetlistName: string
    lastUsedKey?: string | null
    totalUses: number
}

/**
 * Record song usage for all song tracks in a published setlist.
 * Fire-and-forget — errors logged, not thrown.
 */
export async function recordSongUsage(
    setlistId: string,
    setlistName: string,
    eventDate: Date,
    tracks: Array<{ fileId?: string; title: string; key?: string; type?: string }>
): Promise<{ recorded: number; skipped: number }> {
    initAdmin()
    const db = getFirestore()

    const songTracks = tracks.filter(t => t.fileId && (!t.type || t.type === 'song'))
    let recorded = 0
    let skipped = 0

    for (const track of songTracks) {
        try {
            const summaryRef = db.collection('songUsage').doc(track.fileId!)
            const eventRef = summaryRef.collection('events').doc()

            const batch = db.batch()

            // Upsert summary
            batch.set(summaryRef, {
                fileId: track.fileId,
                lastUsedDate: eventDate,
                lastUsedSetlistId: setlistId,
                lastUsedSetlistName: setlistName,
                lastUsedKey: track.key || null,
                totalUses: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true })

            // Append event
            batch.create(eventRef, {
                setlistId,
                setlistName,
                eventDate,
                key: track.key || null,
                publishedAt: FieldValue.serverTimestamp(),
            })

            await batch.commit()
            recorded++
        } catch (err) {
            logger.warn(`[SongUsage] Failed to record usage for ${track.fileId}:`, err)
            skipped++
        }
    }

    return { recorded, skipped }
}

/**
 * Fetch usage summaries for a list of file IDs.
 * Returns a map keyed by fileId.
 */
export async function getUsageSummaries(
    fileIds: string[]
): Promise<Map<string, SongUsageSummary>> {
    if (fileIds.length === 0) return new Map()

    initAdmin()
    const db = getFirestore()
    const result = new Map<string, SongUsageSummary>()

    // Batch reads in chunks of 30 (Firestore getAll limit)
    for (let i = 0; i < fileIds.length; i += 30) {
        const chunk = fileIds.slice(i, i + 30)
        const refs = chunk.map(id => db.collection('songUsage').doc(id))
        const docs = await db.getAll(...refs)
        for (const doc of docs) {
            if (doc.exists) {
                const data = doc.data()!
                result.set(doc.id, {
                    fileId: doc.id,
                    lastUsedDate: data.lastUsedDate?.toDate?.() || data.lastUsedDate,
                    lastUsedSetlistId: data.lastUsedSetlistId,
                    lastUsedSetlistName: data.lastUsedSetlistName,
                    lastUsedKey: data.lastUsedKey,
                    totalUses: data.totalUses || 0,
                })
            }
        }
    }

    return result
}
