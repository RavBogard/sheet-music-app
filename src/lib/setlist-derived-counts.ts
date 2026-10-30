/**
 * The setlist fields derived from its tracks: `trackCount`, `songCount` and
 * `fileIds`. One definition for every writer, server and client, so they all
 * agree on what the values are and in what order `fileIds` is stored.
 *
 * These fields belong to the server. The browser editor used to reconcile
 * them through its outbox from its local copy, which is routinely stale when
 * the setlist is authored over MCP; those rows overwrote correct server
 * counts and raised false "Remote changes detected" conflicts. Every server
 * track writer now writes them from its post-write track list, and the client
 * commit path (`reconcileSetlistTrackCount`) recomputes them from the server's
 * tracks after each client track write.
 *
 * Safe to import from both server and client code (no `server-only`).
 */

/**
 * Does this track count toward `songCount`? A track is a song unless it
 * carries an explicit non-"song" type (header / reading / prayer /
 * transition / note).
 */
export function isSongType(type: unknown): boolean {
    return !type || type === 'song'
}

export interface DerivableTrack {
    type?: unknown
    fileId?: unknown
}

/**
 * The canonical `fileIds` aggregate: every non-empty chart id on the
 * setlist's tracks, de-duplicated and sorted. Sorted (not track order) so a
 * reorder never changes it and every writer produces the same array.
 */
export function canonicalFileIds(tracks: readonly DerivableTrack[]): string[] {
    const ids = new Set<string>()
    for (const t of tracks) {
        if (typeof t.fileId === 'string' && t.fileId.length > 0) ids.add(t.fileId)
    }
    return [...ids].sort()
}

export interface SetlistDerivedCounts {
    trackCount: number
    songCount: number
    fileIds: string[]
}

/** All three derived fields from a setlist's complete track list. */
export function deriveSetlistCounts(
    tracks: readonly DerivableTrack[],
): SetlistDerivedCounts {
    return {
        trackCount: tracks.length,
        songCount: tracks.filter((t) => isSongType(t.type)).length,
        fileIds: canonicalFileIds(tracks),
    }
}

/** Does a stored `fileIds` value already equal the canonical one? A missing
 *  field counts as empty. */
export function sameFileIds(a: unknown, b: readonly string[]): boolean {
    if (a === undefined || a === null) return b.length === 0
    return (
        Array.isArray(a) &&
        a.length === b.length &&
        a.every((id, i) => id === b[i])
    )
}
