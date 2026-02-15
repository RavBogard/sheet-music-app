import { describe, it, expect, vi } from 'vitest'

// Mock Firebase to avoid initialization errors in test environment
vi.mock('./firebase', () => ({
    db: {},
    auth: { currentUser: null },
}))

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    updateDoc: vi.fn(),
    onSnapshot: vi.fn(),
    collection: vi.fn(),
}))

import { INSTRUMENT_PRESETS } from './musician-profile'

describe('INSTRUMENT_PRESETS', () => {
    it('contains all expected instruments', () => {
        const keys = Object.keys(INSTRUMENT_PRESETS)
        expect(keys).toContain('acoustic_guitar')
        expect(keys).toContain('piano')
        expect(keys).toContain('voice')
        expect(keys).toContain('bb_trumpet')
        expect(keys).toContain('eb_alto_sax')
        expect(keys).toContain('f_horn')
        expect(keys).toContain('other')
    })

    it('has at least 10 presets', () => {
        expect(Object.keys(INSTRUMENT_PRESETS).length).toBeGreaterThanOrEqual(10)
    })

    it('every preset has required fields', () => {
        for (const [key, preset] of Object.entries(INSTRUMENT_PRESETS)) {
            expect(preset.label, `${key} missing label`).toBeTruthy()
            expect(typeof preset.transposition, `${key} transposition not a number`).toBe('number')
            expect(preset.description, `${key} missing description`).toBeTruthy()
        }
    })

    describe('concert pitch instruments', () => {
        it.each(['acoustic_guitar', 'electric_bass', 'piano', 'voice', 'ukulele'])('%s has 0 transposition', (instrument) => {
            expect(INSTRUMENT_PRESETS[instrument].transposition).toBe(0)
        })
    })

    describe('Bb instruments', () => {
        it.each(['bb_trumpet', 'bb_clarinet', 'bb_tenor_sax', 'bb_soprano_sax'])('%s has +2 transposition', (instrument) => {
            expect(INSTRUMENT_PRESETS[instrument].transposition).toBe(2)
        })
    })

    describe('Eb instruments', () => {
        it('Eb Alto Sax has -3 transposition', () => {
            expect(INSTRUMENT_PRESETS['eb_alto_sax'].transposition).toBe(-3)
        })
    })

    describe('F instruments', () => {
        it('French Horn has +7 transposition', () => {
            expect(INSTRUMENT_PRESETS['f_horn'].transposition).toBe(7)
        })
    })

    describe('CRC ensemble instruments', () => {
        it.each([
            'acoustic_guitar', 'electric_bass', 'mandolin',
            'electric_guitar', 'classical_guitar', 'voice', 'hand_drums'
        ])('%s is in the presets', (instrument) => {
            expect(INSTRUMENT_PRESETS[instrument]).toBeDefined()
        })

        it.each(['violin', 'eb_alto_sax', 'bb_clarinet', 'bb_trumpet'])(
            'occasional instrument %s is in the presets', (instrument) => {
                expect(INSTRUMENT_PRESETS[instrument]).toBeDefined()
            }
        )
    })

    describe('capo suggestions', () => {
        it('acoustic guitar suggests capo', () => {
            expect(INSTRUMENT_PRESETS['acoustic_guitar'].suggestCapo).toBe(true)
        })

        it('electric guitar does not suggest capo', () => {
            expect(INSTRUMENT_PRESETS['electric_guitar'].suggestCapo).toBeFalsy()
        })

        it('non-string instruments do not suggest capo', () => {
            expect(INSTRUMENT_PRESETS['bb_trumpet'].suggestCapo).toBeFalsy()
            expect(INSTRUMENT_PRESETS['voice'].suggestCapo).toBeFalsy()
        })
    })

    it('transpositions are within valid range (-12 to +12)', () => {
        for (const [key, preset] of Object.entries(INSTRUMENT_PRESETS)) {
            expect(preset.transposition, `${key} transposition out of range`).toBeGreaterThanOrEqual(-12)
            expect(preset.transposition, `${key} transposition out of range`).toBeLessThanOrEqual(12)
        }
    })

    it('"other" has 0 default transposition', () => {
        expect(INSTRUMENT_PRESETS['other'].transposition).toBe(0)
    })
})
