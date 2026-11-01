import { describe, expect, it, vi } from 'vitest'
import { claimPlayback, releasePlayback } from '../now-playing'

function fakeAudio() {
    return { pause: vi.fn() } as unknown as HTMLAudioElement & { pause: ReturnType<typeof vi.fn> }
}

describe('now-playing', () => {
    it('now-playing pauses the previous element', () => {
        const a = fakeAudio()
        const b = fakeAudio()
        claimPlayback(a)
        claimPlayback(b)
        expect(a.pause).toHaveBeenCalledTimes(1)
        expect(b.pause).not.toHaveBeenCalled()
    })

    it('re-claiming with the same element does not pause it', () => {
        const a = fakeAudio()
        claimPlayback(a)
        claimPlayback(a)
        expect(a.pause).not.toHaveBeenCalled()
    })

    it('a released element is not paused by the next claim', () => {
        const a = fakeAudio()
        const b = fakeAudio()
        claimPlayback(a)
        releasePlayback(a)
        claimPlayback(b)
        expect(a.pause).not.toHaveBeenCalled()
    })
})
