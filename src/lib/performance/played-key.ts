import { getTransposedKeyName } from "@/lib/music-math"

/**
 * The key a row is PLAYED in: the written key moved by the leader's per-track
 * transposition, or else by the musician's profile default. Shared by the
 * Perform setlist row's key badge and SongNavigation's "Next" line so the two
 * never disagree. Returns the bare key name ("Eb"), without the "(+2)" suffix.
 */
export function playedKey(
    key: string | null | undefined,
    trackTransposition: number | undefined,
    defaultTransposition = 0,
): string | null {
    if (!key) return null
    const effective = trackTransposition !== undefined && trackTransposition !== 0
        ? trackTransposition
        : defaultTransposition
    if (effective === 0) return key
    const fullName = getTransposedKeyName(key, effective)
    const parenIdx = fullName.indexOf(" (")
    return parenIdx > -1 ? fullName.substring(0, parenIdx) : fullName
}
