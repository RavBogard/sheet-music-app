/**
 * WS-12 (v11.6-03-02): an offline Firestore `onSnapshot` error must NOT blank an
 * already-open set. In incognito / memory-cache mode a transient offline error
 * sets the hook's `error`, and the Perform client used to return a full-screen
 * error screen unconditionally — wiping a set the band was mid-service on.
 *
 * Gate the fatal error on whether there is loaded content to fall back on:
 *   - tracks already hydrated (served from the SSR seed / Dexie cache / a prior
 *     live frame) → keep rendering the set; the PerformanceOfflineIndicator
 *     already signals the offline/reconnecting state non-blockingly.
 *   - no loaded tracks (genuine initial load failure / permission-denied /
 *     not-found on an empty view) → show the full-screen error as before.
 */
export function shouldShowFatalSetlistError(
    errorMessage: string | null,
    hasLoadedTracks: boolean,
): boolean {
    return errorMessage !== null && !hasLoadedTracks
}
