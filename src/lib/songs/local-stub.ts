import type { LocalSong } from '../local/types'

/**
 * The local `songs` row an upload puts so the setlist picker sees a new chart
 * before the songs listener delivers the server doc.
 *
 * It carries the same tenant and freshness stamps the server writes on
 * `songs/{fileId}` (`orgId`, `status`, `updatedAt`). A row without `orgId`
 * reads as crc, so on brotherslazaroff.live an unstamped row was dropped by
 * the next scope pass and, on crc, it outlived the listener's view of the
 * song. The listener's copy replaces this one when it arrives.
 */
export function uploadedSongRow(fileId: string, title: string, orgId: string, now: number = Date.now()): LocalSong {
    return {
        id: fileId,
        title,
        normalizedTitle: title.toLowerCase(),
        status: 'active',
        orgId,
        updatedAt: now,
    }
}
