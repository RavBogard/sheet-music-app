// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock environment variables required by Next.js imports before loading the hook
vi.mock('@/lib/env', () => ({
    env: { FIREBASE_SERVICE_ACCOUNT_KEY: 'test', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test' }
}))

// Mock React usage within the hook
vi.mock('react', () => ({
    useEffect: vi.fn(),
    useState: vi.fn((init) => [typeof init === 'function' ? init() : init, vi.fn()]),
    useCallback: vi.fn((fn) => fn),
    useRef: vi.fn(() => ({ current: null })),
}))

import { mergeAiResults } from './use-smart-transposer'
import { acquireAiSlot, releaseAiSlot, resetAiConcurrency } from '@/lib/ai-concurrency'
import type { ChordOverlay, CachedChord } from '@/lib/chord-cache'

describe('Concurrency Limiter (acquireAiSlot / releaseAiSlot)', () => {
    beforeEach(() => {
        resetAiConcurrency()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('allows up to 2 concurrent slots instantly', async () => {
        const slot1 = acquireAiSlot()
        const slot2 = acquireAiSlot()

        await expect(slot1).resolves.toBeUndefined()
        await expect(slot2).resolves.toBeUndefined()

        // Cleanup
        releaseAiSlot()
        releaseAiSlot()
    })

    it('queues request 3 until a slot is released', async () => {
        await acquireAiSlot() // Uses slot 1
        await acquireAiSlot() // Uses slot 2

        let slot3Resolved = false
        acquireAiSlot().then(() => { slot3Resolved = true })

        // Wait a tick to let promises flush
        await vi.runAllTimersAsync()

        // Slot 3 should still be waiting
        expect(slot3Resolved).toBe(false)

        // Release one
        releaseAiSlot()

        // Wait for queue microtasks
        await vi.runAllTimersAsync()

        // Now Slot 3 should be granted
        expect(slot3Resolved).toBe(true)

        // Cleanup
        releaseAiSlot()
        releaseAiSlot()
    })
})

describe('mergeAiResults', () => {
    it('returns exact text layer chords if no AI chords or overrides are provided', () => {
        const textChords: ChordOverlay[] = [
            { text: 'A', originalText: 'A', x: 10, y: 20 },
            { text: 'D', originalText: 'D', x: 50, y: 60 },
        ]

        const result = mergeAiResults(textChords, [], [])

        expect(result).toHaveLength(2)
        expect(result[0].text).toBe('A')
        expect(result[1].text).toBe('D')
    })

    it('corrects a text layer chord if AI finds a match within the tolerance radius', () => {
        const textChords: ChordOverlay[] = [
            { text: 'Ann', originalText: 'Ann', x: 10, y: 20 }, // Bad OCR 
        ]
        const aiChords = [
            { text: 'Am', x: 12, y: 19 } // Very close structurally
        ]

        const result = mergeAiResults(textChords, aiChords, [])

        expect(result).toHaveLength(1)
        expect(result[0].text).toBe('Am')
        expect(result[0].source).toBe('ai')
    })

    it('adds new chords discovered by AI that text layer completely missed', () => {
        const textChords: ChordOverlay[] = [
            { text: 'C', originalText: 'C', x: 100, y: 100 },
        ]
        const aiChords = [
            { text: 'G7', x: 10, y: 20 } // Miles away from C
        ]

        const result = mergeAiResults(textChords, aiChords, [])

        expect(result).toHaveLength(2)
        expect(result[0].text).toBe('C') // Original untouched

        const added = result[1]
        expect(added.text).toBe('G7')
        expect(added.source).toBe('ai')
        expect(added.x).toBe(10)
    })

    it('applies user override as the absolute highest priority', () => {
        const textChords: ChordOverlay[] = [
            { text: 'Ann', originalText: 'Ann', x: 10, y: 20 },
        ]
        const aiChords = [
            { text: 'Am', x: 12, y: 19 } // AI thought it was Am
        ]
        const overrides: CachedChord[] = [
            { text: 'Amaj7', originalText: 'Ann', x: 11, y: 19.5, source: 'user' } // User explicitly said Amaj7
        ]

        const result = mergeAiResults(textChords, aiChords, overrides)

        expect(result).toHaveLength(1)
        expect(result[0].text).toBe('Amaj7') // User wins
        expect(result[0].source).toBe('user')
    })

    it('adds a user override chord if textlayer and AI both missed it', () => {
        const textChords: ChordOverlay[] = []
        const aiChords: { text: string, x: number, y: number }[] = []
        const overrides: CachedChord[] = [
            { text: 'F', originalText: '', x: 50, y: 50, source: 'user' }
        ]

        const result = mergeAiResults(textChords, aiChords, overrides)

        expect(result).toHaveLength(1)
        expect(result[0].text).toBe('F')
        expect(result[0].source).toBe('user')
    })
})
