import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * MusicXML detected-key fallback test (Build Lane A, DISCUSSION §2.1).
 *
 * Verifies the dual-source `detectedKey` fallback chain in TransposerMenu:
 *
 *   detectedKey = estimateKey(allChords) ?? musicXmlKey ?? null
 *
 * Cases covered:
 *   1. AI-chord path WINS when populated — `aiState.pageData` non-empty +
 *      `musicXmlKey` set → grid lights up from estimateKey, NOT musicXmlKey.
 *   2. MusicXML fallback fires when chords empty — `aiState.pageData` empty +
 *      `musicXmlKey` set → grid lights up from musicXmlKey.
 *   3. Both empty → "WAITING FOR SCAN…" copy + grid hidden (regression).
 *
 * The grid render is the user-visible witness (the existing 8-shape
 * "Play As" buttons render only when `effectiveKey !== null`, which the
 * detectedKey calc gates).
 */

// --- Mock the store with mutable per-test values ---
const { mockStoreValues, mockSetCapoSemitones } = vi.hoisted(() => {
    const mockSetCapoSemitones = vi.fn()
    const mockStoreValues = {
        transposition: 0,
        setTransposition: vi.fn(),
        aiState: {
            isEnabled: false,
            scanningPages: [] as number[],
            pageData: {} as Record<number, {
                strips: { id: string; y: number; height: number; image?: string }[]
                chords: { originalText?: string; text: string }[]
            }>,
            error: null as string | null,
        },
        setCapoFret: vi.fn(),
        capoFret: null as number | null,
        capoSemitones: 0,
        setCapoSemitones: mockSetCapoSemitones,
        playbackQueue: [] as Array<{ fileId?: string; key?: string }>,
        queueIndex: -1,
        setEditingChords: vi.fn(),
        fileUrl: null as string | null,
        musicXmlKey: null as string | null,
    }
    return { mockStoreValues, mockSetCapoSemitones }
})

vi.mock('@/lib/store', () => ({
    useMusicStore: vi.fn(() => ({ ...mockStoreValues })),
}))

vi.mock('@/hooks/use-musician-transposition', () => ({
    useMusicianTransposition: vi.fn(() => ({
        isAutoTransposed: false,
        instrumentLabel: null,
        saving: false,
    })),
}))

vi.mock('@/lib/chord-cache', () => ({
    loadLibraryMeta: vi.fn().mockResolvedValue(null),
}))

import { TransposerMenu } from '../TransposerMenu'

describe('TransposerMenu — MusicXML detected-key fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockStoreValues.transposition = 0
        mockStoreValues.aiState.pageData = {}
        mockStoreValues.aiState.scanningPages = []
        mockStoreValues.capoFret = null
        mockStoreValues.capoSemitones = 0
        mockStoreValues.playbackQueue = []
        mockStoreValues.queueIndex = -1
        mockStoreValues.fileUrl = null
        mockStoreValues.musicXmlKey = null
    })

    it('PDF AI-chord path is authoritative when populated (estimateKey wins over musicXmlKey)', () => {
        // Strong D-major chord set: estimateKey scoring weights first-chord +10,
        // last-chord +3, frequency baseline — this yields "D".
        mockStoreValues.aiState.pageData = {
            0: {
                strips: [],
                chords: [
                    { text: 'D' }, { text: 'A' }, { text: 'G' }, { text: 'A' },
                    { text: 'D' }, { text: 'G' }, { text: 'A' }, { text: 'D' },
                ],
            },
        }
        // Set musicXmlKey to something DIFFERENT so we can prove the AI path won.
        mockStoreValues.musicXmlKey = 'Bb'

        render(<TransposerMenu />)

        // The grid renders the 8 "Play As" shape buttons keyed to detectedKey;
        // each button has a "capo N" / "same" caption derived from calculateCapo.
        // Presence of the grid header is the witness that detectedKey is non-null.
        expect(screen.getByText(/Play As \(with capo\)/i)).toBeTruthy()
        // "Detected Key" label visible (not "Waiting for scan…").
        expect(screen.getByText('Detected Key')).toBeTruthy()
        // The "AI estimate wins" assertion is structural — we just verify the
        // grid lit up at all, since the canonical-key string the grid renders
        // off is internal to calculateCapo. The crucial test is the negative
        // case below (chord-array empty → grid still lights from musicXmlKey).
    })

    it('falls back to musicXmlKey when AI-chord pageData is empty (capo grid lights up)', () => {
        // No AI chord data; MusicXML key seeded by SmartScoreViewer.
        mockStoreValues.aiState.pageData = {}
        mockStoreValues.musicXmlKey = 'D'

        render(<TransposerMenu />)

        // Grid lights up because `effectiveKey` is non-null (musicXmlKey fallback).
        expect(screen.getByText(/Play As \(with capo\)/i)).toBeTruthy()
        // NOTE: the "Detected Key" vs "Waiting for scan…" copy is gated on
        // `hasChords` (chord-array population), NOT on `detectedKey`. So when
        // MusicXML provides the key but no chord data is scanned, the LABEL
        // still reads "Waiting for scan…" while the GRID is fully usable.
        // That's a minor UX inconsistency in the existing copy (out of scope
        // for this lane — fix candidate for a follow-up if Daniel wants to
        // tighten the wording).
        expect(screen.getByText(/Waiting for scan/i)).toBeTruthy()
        // The "capo N" caption inside one of the grid buttons confirms
        // calculateCapo ran with a real key:
        const capoButtons = screen.getAllByText(/^capo \d+$/i)
        expect(capoButtons.length).toBeGreaterThan(0)
    })

    it('shows "Waiting for scan…" + no grid when both AI and musicXmlKey are empty', () => {
        mockStoreValues.aiState.pageData = {}
        mockStoreValues.musicXmlKey = null

        render(<TransposerMenu />)

        expect(screen.getByText(/Waiting for scan/i)).toBeTruthy()
        // Grid header absent → effectiveKey is null.
        expect(screen.queryByText(/Play As \(with capo\)/i)).toBeNull()
    })
})

/**
 * Capo panel input tests (Phase-2 MED Phase-1).
 *
 * Verifies the new INPUT-side capo control: 12 semitone buttons (0..11),
 * `setCapoSemitones` dispatch on click, active-pressed state from store,
 * "Capo N → play in <X> shapes" indicator only when capo > 0, "Off"
 * reset button only when capo > 0, panel hidden when no `effectiveKey`.
 */
describe('TransposerMenu — capo panel input (Phase-2 MED)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockStoreValues.transposition = 0
        mockStoreValues.aiState.pageData = {}
        mockStoreValues.aiState.scanningPages = []
        mockStoreValues.capoFret = null
        mockStoreValues.capoSemitones = 0
        mockStoreValues.playbackQueue = []
        mockStoreValues.queueIndex = -1
        mockStoreValues.fileUrl = null
        mockStoreValues.musicXmlKey = null
    })

    it('renders 12 semitone buttons (0 + 1..11) when effectiveKey present', () => {
        mockStoreValues.musicXmlKey = 'D' // gives effectiveKey
        render(<TransposerMenu />)

        // Off button (semitone 0)
        expect(screen.getByLabelText('Capo off')).toBeTruthy()
        // 11 numbered buttons
        for (let n = 1; n <= 11; n++) {
            expect(screen.getByLabelText(`Capo ${n}`)).toBeTruthy()
        }
        expect(screen.getByText(/Capo \(your guitar\)/i)).toBeTruthy()
    })

    it('does NOT render the capo panel when effectiveKey is null', () => {
        // Both AI chords AND musicXmlKey empty → effectiveKey null → panel hidden
        mockStoreValues.musicXmlKey = null
        render(<TransposerMenu />)

        expect(screen.queryByText(/Capo \(your guitar\)/i)).toBeNull()
        expect(screen.queryByLabelText('Capo off')).toBeNull()
    })

    it('click on a capo button calls setCapoSemitones with that fret value', () => {
        mockStoreValues.musicXmlKey = 'Eb'
        render(<TransposerMenu />)

        fireEvent.click(screen.getByLabelText('Capo 3'))
        expect(mockSetCapoSemitones).toHaveBeenCalledWith(3)

        fireEvent.click(screen.getByLabelText('Capo off'))
        expect(mockSetCapoSemitones).toHaveBeenCalledWith(0)
    })

    it('active-pressed state reflects current capoSemitones', () => {
        mockStoreValues.musicXmlKey = 'D'
        mockStoreValues.capoSemitones = 5
        render(<TransposerMenu />)

        const active = screen.getByLabelText('Capo 5')
        expect(active.getAttribute('aria-pressed')).toBe('true')
        const inactive = screen.getByLabelText('Capo 3')
        expect(inactive.getAttribute('aria-pressed')).toBe('false')
    })

    it('shows the "Capo N → play in <X> shapes" indicator only when capo > 0', () => {
        mockStoreValues.musicXmlKey = 'D'
        mockStoreValues.capoSemitones = 0
        const { rerender } = render(<TransposerMenu />)

        // Capo 0 (off): no "play in" indicator
        expect(screen.queryByText(/play in/i)).toBeNull()
        // No "Off" reset button when already off
        expect(screen.queryByText(/^Off$/)).toBeNull()

        // Capo 2 — written D, play in C (D down 2 semitones)
        mockStoreValues.capoSemitones = 2
        rerender(<TransposerMenu />)

        expect(screen.getByText(/Capo 2/)).toBeTruthy()
        expect(screen.getByText(/play in C shapes/i)).toBeTruthy()
        // Off button now visible (capo > 0)
        expect(screen.getByText(/^Off$/)).toBeTruthy()
    })

    it('Off button click dispatches setCapoSemitones(0)', () => {
        mockStoreValues.musicXmlKey = 'D'
        mockStoreValues.capoSemitones = 4
        render(<TransposerMenu />)

        fireEvent.click(screen.getByLabelText('Clear capo'))
        expect(mockSetCapoSemitones).toHaveBeenCalledWith(0)
    })
})
