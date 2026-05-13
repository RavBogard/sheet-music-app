"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { getDb } from "@/lib/local/schema"
import type { LocalTrack } from "@/lib/local/types"

/**
 * v60-06-04: Bulk version of the single-setlist Dexie subscription pattern
 * used by useSetlistPerformance. Returns a Map<setlistId, LocalTrack[]>
 * keyed by setlistId, each value sorted by order ascending.
 *
 *  - undefined while the query is in flight (useLiveQuery loading semantics)
 *  - empty Map when no rows match (resolved)
 *  - subscription auto-updates on any matching Dexie row change
 *    (rename, reorder, add, delete), via dexie-react-hooks' BroadcastChannel-
 *    aware live query — Daniel rename → next paint shows new title across tabs
 *  - empty setlistIds short-circuits without hitting Dexie
 *
 * Caller maps Map entries through getTracksForSetlistClient(localTracks,
 * setlistData) to apply the canonical 3-branch hydrated/legacy fallback —
 * see useSetlistPerformance for the single-setlist consumer of the same
 * pattern.
 */
export function useDexieTracksForSetlists(
    setlistIds: string[],
): Map<string, LocalTrack[]> | undefined {
    // useLiveQuery deps must be primitive-comparable. Upstream may produce
    // ids in arbitrary order across renders — sort + join keeps the dep
    // string stable for identical set membership.
    const key = setlistIds.slice().sort().join(",")

    return useLiveQuery<Map<string, LocalTrack[]> | undefined>(
        async () => {
            if (setlistIds.length === 0) return new Map()
            const rows = await getDb()
                .tracks.where("setlistId")
                .anyOf(setlistIds)
                .sortBy("order")
            const map = new Map<string, LocalTrack[]>()
            for (const t of rows) {
                const arr = map.get(t.setlistId) ?? []
                arr.push(t)
                map.set(t.setlistId, arr)
            }
            return map
        },
        [key],
    )
}
