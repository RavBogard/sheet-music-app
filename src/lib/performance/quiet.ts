/**
 * "Nothing here is news": the seconds after this device replaced its own cache
 * from the server render or a heal refetch. A row that differs then is the
 * cache catching up, not another device's edit, so the remote-change
 * highlight stays off for the window.
 */
export const QUIET_MS = 1500
const until = new Map<string, number>()

export function quietFor(setlistId: string, ms = QUIET_MS, now = Date.now()): void {
    until.set(setlistId, Math.max(until.get(setlistId) ?? 0, now + ms))
}

export function isQuiet(setlistId: string, now = Date.now()): boolean {
    return now < (until.get(setlistId) ?? 0)
}

export function _resetQuiet(): void {
    until.clear()
}
