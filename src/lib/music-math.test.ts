import { describe, it, expect } from 'vitest'
import { transposeChord, calculateCapo, estimateKey, getTransposedKeyName, normalizeChord, keyUsesFlats } from './music-math'

describe('transposeChord', () => {
    describe('basic transposition', () => {
        it('transposes up by semitones', () => {
            expect(transposeChord('C', 1)).toBe('Db')
            expect(transposeChord('C', 2)).toBe('D')
            expect(transposeChord('C', 7)).toBe('G')
            expect(transposeChord('C', 12)).toBe('C')
        })

        it('transposes down by semitones', () => {
            expect(transposeChord('C', -1)).toBe('B')
            expect(transposeChord('C', -2)).toBe('Bb')
            expect(transposeChord('D', -2)).toBe('C')
        })

        it('returns unchanged for 0 semitones', () => {
            expect(transposeChord('Am7', 0)).toBe('Am7')
            expect(transposeChord('G/B', 0)).toBe('G/B')
        })

        it('handles wrapping around the scale', () => {
            expect(transposeChord('B', 1)).toBe('C')
            expect(transposeChord('C', -1)).toBe('B')
            expect(transposeChord('A', 3)).toBe('C')
        })
    })

    describe('accidentals', () => {
        it('transposes sharp notes', () => {
            expect(transposeChord('F#', 1)).toBe('G')
            // Eb is always preferred over D# as a chord root
            expect(transposeChord('C#', 2)).toBe('Eb')
        })

        it('transposes flat notes', () => {
            expect(transposeChord('Bb', 2)).toBe('C')
            expect(transposeChord('Eb', 1)).toBe('E')
            expect(transposeChord('Db', -1)).toBe('C')
        })

        it('respects preferFlats parameter', () => {
            expect(transposeChord('C', 1, true)).toBe('Db')
            expect(transposeChord('C', 1, false)).toBe('C#')
            expect(transposeChord('D', 1, true)).toBe('Eb')
            // Eb is always preferred over D# even with preferFlats=false
            expect(transposeChord('D', 1, false)).toBe('Eb')
        })

        it('produces consistent accidentals within a key context', () => {
            // In Bb major context (preferFlats=true): all accidentals should be flats
            expect(transposeChord('G', 3, true)).toBe('Bb')    // not A#
            expect(transposeChord('A', 3, true)).toBe('C')
            expect(transposeChord('D', 3, true)).toBe('F')
            expect(transposeChord('C', 3, true)).toBe('Eb')    // not D#

            // In A major context (preferFlats=false): all accidentals should be sharps
            expect(transposeChord('G', 2, false)).toBe('A')
            expect(transposeChord('C', 2, false)).toBe('D')
            expect(transposeChord('D', 2, false)).toBe('E')
            expect(transposeChord('Bb', 2, false)).toBe('C')
        })

        it('preserves sharp convention through transposition', () => {
            // Key of A (sharps): F#m + 2 should stay G#m, not Abm
            expect(transposeChord('F#m', 2)).toBe('G#m')
            // C#m + 2 = Ebm (Eb is always preferred over D# as a chord root)
            expect(transposeChord('C#m', 2)).toBe('Ebm')
            // G# + 2 = Bb (Bb is always preferred over A# as a chord root)
            expect(transposeChord('G#', 2)).toBe('Bb')
        })

        it('preserves flat convention through transposition', () => {
            // Flat chords stay flat
            expect(transposeChord('Bbm', 2)).toBe('Cm')
            expect(transposeChord('Ebm', 2)).toBe('Fm')
            expect(transposeChord('Ab', 2)).toBe('Bb')
        })

        it('never produces A# or D# as chord roots', () => {
            // These spellings are musically unacceptable as chord roots
            // Test all possible transpositions that could land on index 10 (Bb) or 3 (Eb)
            expect(transposeChord('B', -1)).toBe('Bb')      // not A#
            expect(transposeChord('A', 1)).toBe('Bb')       // not A#
            expect(transposeChord('G#', 2)).toBe('Bb')      // not A#
            expect(transposeChord('E', -1)).toBe('Eb')      // not D#
            expect(transposeChord('D', 1)).toBe('Eb')       // not D#
            expect(transposeChord('C#m', 2)).toBe('Ebm')    // not D#m
        })

        it('handles Capo 2 on key of E correctly (Modeh Ani regression)', () => {
            // Capo 2 = transposition -2: shapes sound 2 semitones lower
            const t = -2
            expect(transposeChord('E', t)).toBe('D')
            expect(transposeChord('B', t)).toBe('A')
            expect(transposeChord('A', t)).toBe('G')
            expect(transposeChord('G#m', t)).toBe('F#m')
            expect(transposeChord('C#m', t)).toBe('Bm')     // NOT A#m
            expect(transposeChord('F#m7', t)).toBe('Em7')   // NOT D#m, preserves 7
            expect(transposeChord('D', t)).toBe('C')
        })
    })

    describe('chord qualities preserved', () => {
        it('preserves minor quality', () => {
            expect(transposeChord('Am', 2)).toBe('Bm')
            expect(transposeChord('Dm', 5)).toBe('Gm')
        })

        it('preserves 7th chords', () => {
            expect(transposeChord('G7', 2)).toBe('A7')
            expect(transposeChord('Cmaj7', 4)).toBe('Emaj7')
        })

        it('preserves complex extensions', () => {
            expect(transposeChord('Am7', 3)).toBe('Cm7')
            expect(transposeChord('Dm9', 2)).toBe('Em9')
            expect(transposeChord('Gsus4', 2)).toBe('Asus4')
            expect(transposeChord('Cadd9', 7)).toBe('Gadd9')
        })

        it('preserves diminished and augmented', () => {
            expect(transposeChord('Bdim', 1)).toBe('Cdim')
            expect(transposeChord('Caug', 4)).toBe('Eaug')
        })
    })

    describe('slash chords', () => {
        it('transposes both root and bass note', () => {
            expect(transposeChord('G/B', 2)).toBe('A/C#')
            expect(transposeChord('C/E', 2)).toBe('D/F#')
            expect(transposeChord('Am/G', 2)).toBe('Bm/A')
        })

        it('transposes slash chords with accidental bass', () => {
            expect(transposeChord('D/F#', 2)).toBe('E/G#')
        })
    })

    describe('edge cases', () => {
        it('handles empty/null input', () => {
            expect(transposeChord('', 2)).toBe('')
            expect(transposeChord(null as unknown as string, 2)).toBe(null)
        })

        it('returns non-chord strings unchanged', () => {
            expect(transposeChord('N.C.', 2)).toBe('N.C.')
            expect(transposeChord('Intro', 2)).toBe('Intro')
        })

        it('handles whitespace', () => {
            expect(transposeChord('  Am  ', 2)).toBe('Bm')
        })

        it('handles full chromatic cycle', () => {
            // Transposing up 12 semitones should return to same note
            const chord = 'Am7'
            expect(transposeChord(chord, 12)).toBe(chord)
            expect(transposeChord(chord, -12)).toBe(chord)
        })
    })
})

describe('calculateCapo', () => {
    it('calculates basic capo positions', () => {
        // Playing in G shapes to sound in A = capo 2
        const result = calculateCapo('A', 'G')
        expect(result).toEqual({ fret: 2, transposition: -2 })
    })

    it('calculates capo for common guitar transpositions', () => {
        // Playing in C shapes to sound in D = capo 2
        expect(calculateCapo('D', 'C')).toEqual({ fret: 2, transposition: -2 })

        // Playing in G shapes to sound in Bb = capo 3
        expect(calculateCapo('Bb', 'G')).toEqual({ fret: 3, transposition: -3 })

        // Playing in D shapes to sound in F = capo 3
        expect(calculateCapo('F', 'D')).toEqual({ fret: 3, transposition: -3 })

        // Playing in Am shapes to sound in Dm = capo 5
        expect(calculateCapo('Dm', 'Am')).toEqual({ fret: 5, transposition: -5 })

        // Playing in Em shapes to sound in Am = capo 5
        expect(calculateCapo('Am', 'Em')).toEqual({ fret: 5, transposition: -5 })
    })

    it('returns fret 0 when shapes match the key', () => {
        expect(calculateCapo('G', 'G')).toEqual({ fret: 0, transposition: 0 })
        expect(calculateCapo('Am', 'Am')).toEqual({ fret: 0, transposition: 0 })
    })

    it('handles null/empty input', () => {
        expect(calculateCapo('', 'G')).toBeNull()
        expect(calculateCapo('A', '')).toBeNull()
    })

    it('strips minor quality for calculation', () => {
        // Am and A should give the same capo fret relative to a target
        const resultMinor = calculateCapo('Dm', 'Am')
        const resultMajor = calculateCapo('D', 'A')
        expect(resultMinor?.fret).toBe(resultMajor?.fret)
    })
})

describe('estimateKey', () => {
    it('identifies key from simple progression', () => {
        // Standard C major progression
        expect(estimateKey(['C', 'F', 'G', 'C'])).toBe('C')
    })

    it('identifies minor keys', () => {
        // Am progression
        expect(estimateKey(['Am', 'Dm', 'E', 'Am'])).toBe('Am')
    })

    it('heavily weights the first chord', () => {
        // First chord = G, appears once, but should still win due to position weight
        expect(estimateKey(['G', 'C', 'D', 'C', 'D', 'C'])).toBe('G')
    })

    it('considers last chord', () => {
        // D appears first and last
        expect(estimateKey(['D', 'G', 'A', 'D'])).toBe('D')
    })

    it('handles single chord', () => {
        expect(estimateKey(['Am'])).toBe('Am')
        expect(estimateKey(['G'])).toBe('G')
    })

    it('returns null for empty input', () => {
        expect(estimateKey([])).toBeNull()
        expect(estimateKey(null as unknown as string[])).toBeNull()
    })

    it('handles chords with extensions', () => {
        // Should extract root from complex chords
        expect(estimateKey(['Am7', 'Dm7', 'G7', 'Cmaj7'])).toBeTruthy()
    })

    it('handles real-world worship progressions', () => {
        // Common worship progression in G
        const result = estimateKey(['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'G'])
        expect(result).toBe('G')
    })
})

describe('getTransposedKeyName', () => {
    it('shows transposition direction and amount', () => {
        expect(getTransposedKeyName('Em', 2)).toBe('F#m (+2)')
        expect(getTransposedKeyName('G', -3)).toBe('E (-3)')
    })

    it('returns original key for 0 transposition', () => {
        expect(getTransposedKeyName('Am', 0)).toBe('Am')
    })

    it('handles empty key', () => {
        expect(getTransposedKeyName('', 2)).toBe('')
    })
})

describe('normalizeChord', () => {
    it('trims whitespace', () => {
        expect(normalizeChord('  Am7  ')).toBe('Am7')
    })
})

describe('keyUsesFlats', () => {
    it('returns true for flat keys', () => {
        expect(keyUsesFlats('F')).toBe(true)
        expect(keyUsesFlats('Bb')).toBe(true)
        expect(keyUsesFlats('Eb')).toBe(true)
        expect(keyUsesFlats('Ab')).toBe(true)
        expect(keyUsesFlats('Dm')).toBe(true)
        expect(keyUsesFlats('Gm')).toBe(true)
    })

    it('returns false for sharp keys', () => {
        expect(keyUsesFlats('G')).toBe(false)
        expect(keyUsesFlats('D')).toBe(false)
        expect(keyUsesFlats('A')).toBe(false)
        expect(keyUsesFlats('E')).toBe(false)
        expect(keyUsesFlats('F#')).toBe(false)
        expect(keyUsesFlats('Bm')).toBe(false)
    })

    it('returns undefined for neutral keys', () => {
        expect(keyUsesFlats('C')).toBeUndefined()
        expect(keyUsesFlats('Am')).toBeUndefined()
        expect(keyUsesFlats(null)).toBeUndefined()
    })
})
