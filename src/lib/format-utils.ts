/**
 * Shared formatting utilities
 */

/** Format seconds as human-readable duration: "5s", "3m", "1h 30m" */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
}

/** Format seconds as audio timer: "3:05" */
export function formatPlaybackTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}
