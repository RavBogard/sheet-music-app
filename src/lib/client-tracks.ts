// Client-side hydration-aware reader. Pure function; operates on
// already-fetched dexieTracks + setlistData. Mirrors server-tracks.ts
// but with the 3-branch logic the client needs (snapshot-listener
// can deliver Dexie rows pre-hydration).
//
// v60-08 will drop the unhydrated fallback after v60-06 backfills
// every setlist. Until then, the 3-branch contract is load-bearing.

import type { LocalTrack } from "@/lib/local/types"
import type { SetlistTrack } from "@/types/models"

export function getTracksForSetlistClient(
    dexieTracks: LocalTrack[] | undefined,
    setlistData: { hydrated?: boolean; tracks?: unknown } | null | undefined,
): SetlistTrack[] {
    const fromDexie = (dexieTracks ?? []) as unknown as SetlistTrack[]
    if (setlistData?.hydrated === true) return fromDexie
    if (fromDexie.length > 0) return fromDexie
    return (setlistData?.tracks as SetlistTrack[] | undefined) ?? []
}
