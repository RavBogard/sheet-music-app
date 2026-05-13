import { QueueItem } from "@/lib/store"
import { SetlistTrack } from "@/types/models"

/**
 * Convert a SetlistTrack to a QueueItem for the unified performance view.
 */
export function toQueueItem(track: SetlistTrack, index: number): QueueItem {
    const isSong = !track.type || track.type === 'song'
    const fileId = isSong && track.fileId
        ? track.fileId
        : `flow-${index}` // Synthetic ID for non-song items

    const fileType = (() => {
        if (!track.fileId) return 'pdf'
        const idLower = track.fileId.toLowerCase()
        const nameLower = (track.fileName || '').toLowerCase()

        if (idLower.startsWith('db-') ||
            idLower.endsWith('.musicxml') || idLower.endsWith('.xml') || idLower.endsWith('.mxl') ||
            nameLower.endsWith('.musicxml') || nameLower.endsWith('.xml') || nameLower.endsWith('.mxl')) return 'musicxml'

        if (idLower.endsWith('.chordpro') || nameLower.endsWith('.chordpro')) return 'chordpro'
        if (idLower.endsWith('.txt') || nameLower.endsWith('.txt')) return 'text'

        // Image charts (v70-01): HEIC fileIds rarely surface (upload route renames
        // to .jpg post-conversion), but include the guard for legacy/Drive imports.
        if (/\.(png|jpe?g|heic|heif)$/i.test(idLower) || /\.(png|jpe?g|heic|heif)$/i.test(nameLower)) return 'image'

        return 'pdf'
    })()

    return {
        name: track.title,
        fileId,
        type: fileType as QueueItem['type'],
        audioFileId: track.audioFileId,
        transposition: track.transposition,
        key: track.key,
        tune: track.tune,
        bpm: track.bpm,
        trackType: track.type || 'song',
        performer: track.performer,
        description: track.description,
        estimatedMinutes: track.estimatedMinutes,
    }
}

/**
 * Build a performance queue from setlist tracks and return the
 * queue, starting index, and first file ID to navigate to.
 *
 * Returns null if the setlist has no playable tracks.
 */
export function buildPerformQueue(tracks: SetlistTrack[]): {
    queue: QueueItem[]
    startIndex: number
    firstFileId: string
} | null {
    if (!tracks.length) return null

    const queue = tracks.map(toQueueItem)

    // Find the first playable song (has a real fileId, not a flow item)
    const firstSong = queue.find(q => !q.fileId.startsWith('flow-'))
    if (!firstSong) return null

    const startIndex = queue.indexOf(firstSong)
    return { queue, startIndex, firstFileId: firstSong.fileId }
}
