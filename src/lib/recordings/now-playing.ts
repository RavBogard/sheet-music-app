/**
 * Recordings 2026-11: one recording at a time. A player claims playback when
 * it starts; whichever element held it before is paused. Client only, and
 * never imported from /perform (see src/__tests__/perform-no-audio.test.ts).
 */
let current: HTMLAudioElement | null = null

export function claimPlayback(el: HTMLAudioElement): void {
    if (current && current !== el) {
        try {
            current.pause()
        } catch {
            /* an element already torn down; nothing to pause */
        }
    }
    current = el
}

export function releasePlayback(el: HTMLAudioElement): void {
    if (current === el) current = null
}
