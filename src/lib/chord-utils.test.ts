import { describe, it, expect } from 'vitest'
import { CHORD_REGEX, isChord } from './chord-utils'

/**
 * Tests for chord detection used across the app.
 * The shared chord-utils module is used by both text-scanner (client)
 * and pdf-chord-extractor (server).
 */

describe('CHORD_REGEX', () => {
    describe('basic major chords', () => {
        it.each(['C', 'D', 'E', 'F', 'G', 'B'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('accidentals', () => {
        it.each(['Bb', 'F#', 'Eb', 'C#', 'Ab', 'Db', 'G#'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('minor chords', () => {
        it.each(['Am', 'Dm', 'Em', 'Cm', 'F#m', 'Bbm', 'Amin', 'Dmin'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('seventh chords', () => {
        it.each(['G7', 'Am7', 'Cmaj7', 'Dm7', 'E7', 'Bbmaj7', 'F#m7'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('suspended and added tone chords', () => {
        it.each(['Dsus4', 'Asus2', 'Cadd9', 'Gadd9', 'Esus4'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('diminished and augmented', () => {
        it.each(['Bdim', 'Cdim', 'Caug', 'Eaug', 'Bdim7'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('slash chords', () => {
        it.each(['G/B', 'C/E', 'Am/G', 'D/F#', 'Bb/D', 'Em/B'])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('complex chords found in worship music', () => {
        it.each([
            'Cmaj7', 'Am7', 'Dm9', 'G7sus4', 'Fadd9',
            'Bbmaj7', 'Ebmaj9', 'F#m7',
        ])('matches %s', (chord) => {
            expect(CHORD_REGEX.test(chord)).toBe(true)
        })
    })

    describe('rejects non-chord strings', () => {
        it.each([
            'Hello', 'The', 'verse', 'chorus', 'bridge',
            'Hallelujah', 'Amen', 'Shalom',
            'BPM', 'Key', 'Tempo',
            '', ' ',
        ])('rejects "%s"', (text) => {
            expect(CHORD_REGEX.test(text)).toBe(false)
        })
    })

    describe('rejects Roman numerals (section markers)', () => {
        it.each(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'])('rejects %s', (numeral) => {
            // The regex itself might match single letters like "C" or "D"
            // but the EXCLUDED_WORDS set handles "I", "V", etc.
            // "I" won't match regex (not A-G)
            // "V" won't match regex (not A-G)
            // But just to be safe, test the full isChord function
            expect(isChord(numeral)).toBe(false)
        })
    })
})

describe('isChord (full detection)', () => {
    it('rejects standalone "A" as too ambiguous', () => {
        expect(isChord('A')).toBe(false)
    })

    it('rejects D.C./D.S. fragments', () => {
        expect(isChord('Da')).toBe(false)
        expect(isChord('Dal')).toBe(false)
    })

    it('accepts "Am" (A minor)', () => {
        expect(isChord('Am')).toBe(true)
    })

    it('accepts "A7" (A dominant 7th)', () => {
        expect(isChord('A7')).toBe(true)
    })

    it('rejects strings longer than 10 chars', () => {
        expect(isChord('Cmaj7add9sus4')).toBe(false)
    })

    it('rejects empty string', () => {
        expect(isChord('')).toBe(false)
    })

    it('cleans special characters before testing', () => {
        // Unicode sharp and flat in PDFs
        expect(isChord('F\u266F')).toBe(false) // ♯ gets stripped by the clean regex
        // But standard notation works
        expect(isChord('F#m7')).toBe(true)
    })

    it('rejects section markers', () => {
        const markers = ['Verse', 'Chorus', 'Bridge', 'Intro', 'Outro', 'Coda', 'Solo', 'DC', 'DS', 'CODA', 'FINE']
        for (const m of markers) {
            expect(isChord(m), `Expected "${m}" to NOT be a chord`).toBe(false)
        }
    })

    it('accepts common worship chords', () => {
        const worshipChords = ['G', 'D', 'Em', 'C', 'Am', 'F', 'Dm', 'Bb', 'G/B', 'D/F#', 'Cadd9', 'Dsus4']
        for (const chord of worshipChords) {
            expect(isChord(chord), `Expected "${chord}" to be a chord`).toBe(true)
        }
    })
})
