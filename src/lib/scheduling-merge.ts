/**
 * Scheduling musicians-merge helper — used by the assign transaction
 * in `src/app/api/scheduling/assign/route.ts`. Extracted so it can be
 * unit-tested without spinning up Firestore.
 *
 * v4.3 D03.
 */

export interface SetlistMusician {
    uid?: string
    name: string
    email: string
    instrument?: string | null
}

export interface IncomingMusician {
    uid: string
    name: string
    email: string
    instrument?: string
}

/**
 * Given the current setlist.musicians and a new batch being assigned,
 * return the merged list plus the subset actually added.
 *
 * Dedupe is by uid. Entries with no uid are preserved as-is but cannot
 * be matched against incoming rows (incoming rows always carry uid).
 */
export function mergeNewMusicians(
    existing: SetlistMusician[],
    incoming: IncomingMusician[],
): { merged: SetlistMusician[]; added: SetlistMusician[]; changed: boolean } {
    const existingUids = new Set(existing.map(m => m.uid).filter(Boolean))
    const added: SetlistMusician[] = incoming
        .filter(m => !existingUids.has(m.uid))
        .map(m => ({
            uid: m.uid,
            name: m.name,
            email: m.email,
            instrument: m.instrument || null,
        }))
    if (added.length === 0) {
        return { merged: existing, added: [], changed: false }
    }
    return { merged: [...existing, ...added], added, changed: true }
}
