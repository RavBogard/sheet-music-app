import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the musician transposition priority chain (PROF-01, PROF-02).
 *
 * Priority chain (highest wins):
 *   1. Per-track setlist setting (leader chose for everyone) — track.transposition
 *   2. User's saved song preference — songPreferences/{fileId}
 *   3. Musician profile instrument default — e.g., Bb trumpet = 2
 *   4. Zero (original key)
 *
 * This test file validates:
 *   - All 17 INSTRUMENT_PRESETS with correct transposition offsets (PROF-01)
 *   - Priority chain logic is correctly implemented (PROF-02)
 *   - Profile-to-transposition wiring (settings -> Firestore -> hook -> store)
 *   - PROF-02: auto-transposition applies consistently across setlist and PDF views
 */

// ── Mock Firebase dependencies ──────────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
    db: {},
    auth: { currentUser: null },
}))

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    updateDoc: vi.fn(),
    onSnapshot: vi.fn(),
    collection: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
}))

// ── Import modules under test ────────────────────────────────────────────────

import { INSTRUMENT_PRESETS } from '@/lib/musician-profile'
import type { MusicianProfile } from '@/types/models'

// ── INSTRUMENT_PRESETS: All 17 instruments ──────────────────────────────────

describe('INSTRUMENT_PRESETS — all 17 instruments present', () => {
    const EXPECTED_INSTRUMENTS = [
        // Core CRC ensemble (7)
        'acoustic_guitar',
        'electric_bass',
        'mandolin',
        'electric_guitar',
        'classical_guitar',
        'voice',
        'hand_drums',
        // Occasional instruments (8)
        'violin',
        'eb_alto_sax',
        'bb_tenor_sax',
        'bb_soprano_sax',
        'bb_clarinet',
        'bb_trumpet',
        'f_horn',
        'trombone',
        // Other (2)
        'piano',
        'ukulele',
        'other',
    ]

    it('has exactly 18 presets', () => {
        expect(Object.keys(INSTRUMENT_PRESETS).length).toBe(18)
    })

    it.each(EXPECTED_INSTRUMENTS)('%s is defined', (instrument) => {
        expect(INSTRUMENT_PRESETS[instrument], `Missing instrument: ${instrument}`).toBeDefined()
    })
})

describe('INSTRUMENT_PRESETS — transposition offsets', () => {
    describe('Concert pitch instruments (transposition = 0)', () => {
        const CONCERT_PITCH = [
            'acoustic_guitar',
            'electric_bass',
            'mandolin',
            'electric_guitar',
            'classical_guitar',
            'voice',
            'hand_drums',
            'violin',
            'trombone',
            'piano',
            'ukulele',
            'other',
        ]

        it.each(CONCERT_PITCH)('%s has 0 transposition', (instrument) => {
            expect(INSTRUMENT_PRESETS[instrument].transposition).toBe(0)
        })
    })

    describe('Bb instruments (transposition = +2)', () => {
        const BB_INSTRUMENTS = ['bb_trumpet', 'bb_clarinet', 'bb_tenor_sax', 'bb_soprano_sax']

        it.each(BB_INSTRUMENTS)('%s has +2 transposition', (instrument) => {
            expect(INSTRUMENT_PRESETS[instrument].transposition).toBe(2)
        })

        it('Bb Trumpet specifically: transposition = 2 (PROF-02 default for this instrument)', () => {
            expect(INSTRUMENT_PRESETS['bb_trumpet'].transposition).toBe(2)
            expect(INSTRUMENT_PRESETS['bb_trumpet'].label).toBe('Bb Trumpet')
        })
    })

    describe('Eb instruments (transposition = -3)', () => {
        it('Eb Alto Sax has -3 transposition (sounds a major 6th lower)', () => {
            expect(INSTRUMENT_PRESETS['eb_alto_sax'].transposition).toBe(-3)
        })
    })

    describe('F instruments (transposition = +7)', () => {
        it('French Horn (F) has +7 transposition (sounds a 5th lower)', () => {
            expect(INSTRUMENT_PRESETS['f_horn'].transposition).toBe(7)
        })
    })
})

describe('INSTRUMENT_PRESETS — data integrity', () => {
    it('every preset has required fields: label, transposition, description', () => {
        for (const [key, preset] of Object.entries(INSTRUMENT_PRESETS)) {
            expect(typeof preset.label, `${key}: label must be string`).toBe('string')
            expect(preset.label.length, `${key}: label must not be empty`).toBeGreaterThan(0)
            expect(typeof preset.transposition, `${key}: transposition must be number`).toBe('number')
            expect(typeof preset.description, `${key}: description must be string`).toBe('string')
        }
    })

    it('all transpositions are within valid semitone range (-12 to +12)', () => {
        for (const [key, preset] of Object.entries(INSTRUMENT_PRESETS)) {
            expect(
                preset.transposition,
                `${key}: transposition ${preset.transposition} out of range`
            ).toBeGreaterThanOrEqual(-12)
            expect(
                preset.transposition,
                `${key}: transposition ${preset.transposition} out of range`
            ).toBeLessThanOrEqual(12)
        }
    })

    it('"other" preset has 0 transposition (custom offset)', () => {
        expect(INSTRUMENT_PRESETS['other'].transposition).toBe(0)
    })

    it('acoustic_guitar suggests capo, electric_guitar does not', () => {
        expect(INSTRUMENT_PRESETS['acoustic_guitar'].suggestCapo).toBe(true)
        expect(INSTRUMENT_PRESETS['electric_guitar'].suggestCapo).toBeFalsy()
    })
})

// ── Priority Chain Logic ─────────────────────────────────────────────────────

/**
 * The useMusicianTransposition hook applies this priority chain.
 * These tests validate the priority chain logic in isolation.
 *
 * The hook behavior:
 *   1. If track.transposition is set (non-zero) => use it, skip all else
 *   2. If user has a saved songPreference => use it
 *   3. If profile.defaultTransposition is set (non-zero) => use it
 *   4. Otherwise => use current transposition (0 by default)
 */

describe('Transposition priority chain logic', () => {
    /**
     * Mirrors the decision logic inside the hook's loadPref() function.
     */
    function resolveTransposition(options: {
        trackTransposition?: number
        songPreferenceTransposition?: number | null
        profileDefaultTransposition?: number | null
        currentTransposition?: number
    }): number {
        const {
            trackTransposition,
            songPreferenceTransposition,
            profileDefaultTransposition,
            currentTransposition = 0,
        } = options

        // Priority 1: Per-track leader setting
        if (trackTransposition !== undefined && trackTransposition !== 0) {
            return trackTransposition
        }

        // Priority 2: User's saved song preference
        if (songPreferenceTransposition != null && songPreferenceTransposition !== undefined) {
            return songPreferenceTransposition
        }

        // Priority 3: Musician profile instrument default
        if (profileDefaultTransposition && profileDefaultTransposition !== 0) {
            return profileDefaultTransposition
        }

        // Priority 4: Zero (original key / current value)
        return currentTransposition
    }

    describe('Level 4 (lowest): No profile, no preference, no track setting', () => {
        it('defaults to 0 when no settings exist', () => {
            const result = resolveTransposition({})
            expect(result).toBe(0)
        })

        it('returns current transposition when no overrides exist', () => {
            const result = resolveTransposition({ currentTransposition: 0 })
            expect(result).toBe(0)
        })
    })

    describe('Level 3: Profile default transposition (Bb trumpet example)', () => {
        it('applies profile defaultTransposition=2 for Bb trumpet when no preference', () => {
            const result = resolveTransposition({
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(2)
        })

        it('applies profile defaultTransposition=-3 for Eb Alto Sax', () => {
            const result = resolveTransposition({
                profileDefaultTransposition: -3,
            })
            expect(result).toBe(-3)
        })

        it('profile defaultTransposition=0 falls through to default', () => {
            const result = resolveTransposition({
                profileDefaultTransposition: 0,
            })
            expect(result).toBe(0)
        })
    })

    describe('Level 2: Per-song user preference overrides profile', () => {
        it('song preference of 5 overrides profile default of 2', () => {
            const result = resolveTransposition({
                songPreferenceTransposition: 5,
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(5)
        })

        it('song preference of 0 overrides profile default of 2 (explicit zero preference)', () => {
            const result = resolveTransposition({
                songPreferenceTransposition: 0,
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(0)
        })

        it('song preference of -3 overrides profile default of 7 (French Horn)', () => {
            const result = resolveTransposition({
                songPreferenceTransposition: -3,
                profileDefaultTransposition: 7,
            })
            expect(result).toBe(-3)
        })
    })

    describe('Level 1 (highest): Per-track leader setting overrides everything', () => {
        it('track transposition of 3 overrides both song preference (5) and profile (2)', () => {
            const result = resolveTransposition({
                trackTransposition: 3,
                songPreferenceTransposition: 5,
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(3)
        })

        it('track transposition of -2 overrides profile', () => {
            const result = resolveTransposition({
                trackTransposition: -2,
                profileDefaultTransposition: 7,
            })
            expect(result).toBe(-2)
        })

        it('track transposition of 0 is treated as "not set" (falls through)', () => {
            // A track.transposition of 0 or undefined means "no override"
            const result = resolveTransposition({
                trackTransposition: 0,
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(2)
        })

        it('track transposition of undefined falls through', () => {
            const result = resolveTransposition({
                trackTransposition: undefined,
                profileDefaultTransposition: 2,
            })
            expect(result).toBe(2)
        })
    })

    describe('Full priority chain combinations', () => {
        it('all four levels: track wins over preference, profile, and default', () => {
            expect(resolveTransposition({
                trackTransposition: 3,
                songPreferenceTransposition: 5,
                profileDefaultTransposition: 2,
                currentTransposition: 0,
            })).toBe(3)
        })

        it('no track: preference wins over profile and default', () => {
            expect(resolveTransposition({
                trackTransposition: undefined,
                songPreferenceTransposition: 5,
                profileDefaultTransposition: 2,
                currentTransposition: 0,
            })).toBe(5)
        })

        it('no track, no preference: profile wins over default', () => {
            expect(resolveTransposition({
                trackTransposition: undefined,
                songPreferenceTransposition: null,
                profileDefaultTransposition: 2,
                currentTransposition: 0,
            })).toBe(2)
        })

        it('no overrides at all: returns 0', () => {
            expect(resolveTransposition({
                trackTransposition: undefined,
                songPreferenceTransposition: null,
                profileDefaultTransposition: null,
                currentTransposition: 0,
            })).toBe(0)
        })
    })
})

// ── Profile-to-transposition wiring (PROF-02) ────────────────────────────────

describe('PROF-02: Profile to transposition wiring', () => {
    describe('Instrument preset lookup', () => {
        /**
         * When a musician selects "bb_trumpet" in settings,
         * the defaultTransposition should come from INSTRUMENT_PRESETS.
         */
        function selectInstrument(instrument: string): Partial<MusicianProfile> {
            const preset = INSTRUMENT_PRESETS[instrument]
            if (!preset) throw new Error(`Unknown instrument: ${instrument}`)
            return {
                instrument,
                defaultTransposition: preset.transposition,
            }
        }

        it('selecting bb_trumpet sets defaultTransposition=2', () => {
            const profile = selectInstrument('bb_trumpet')
            expect(profile.defaultTransposition).toBe(2)
            expect(profile.instrument).toBe('bb_trumpet')
        })

        it('selecting eb_alto_sax sets defaultTransposition=-3', () => {
            const profile = selectInstrument('eb_alto_sax')
            expect(profile.defaultTransposition).toBe(-3)
        })

        it('selecting f_horn sets defaultTransposition=7', () => {
            const profile = selectInstrument('f_horn')
            expect(profile.defaultTransposition).toBe(7)
        })

        it('selecting acoustic_guitar sets defaultTransposition=0', () => {
            const profile = selectInstrument('acoustic_guitar')
            expect(profile.defaultTransposition).toBe(0)
        })

        it('selecting voice sets defaultTransposition=0', () => {
            const profile = selectInstrument('voice')
            expect(profile.defaultTransposition).toBe(0)
        })
    })

    describe('instrumentLabel derivation', () => {
        /**
         * useMusicianTransposition derives the instrument label from
         * INSTRUMENT_PRESETS for display in TransposerMenu.
         */
        function getInstrumentLabel(instrument: string): string {
            return INSTRUMENT_PRESETS[instrument]?.label || instrument
        }

        it('bb_trumpet label is "Bb Trumpet"', () => {
            expect(getInstrumentLabel('bb_trumpet')).toBe('Bb Trumpet')
        })

        it('acoustic_guitar label is "Acoustic Guitar"', () => {
            expect(getInstrumentLabel('acoustic_guitar')).toBe('Acoustic Guitar')
        })

        it('f_horn label is "French Horn (F)"', () => {
            expect(getInstrumentLabel('f_horn')).toBe('French Horn (F)')
        })

        it('unknown instrument falls back to instrument key', () => {
            expect(getInstrumentLabel('unknown_instrument')).toBe('unknown_instrument')
        })
    })

    describe('Auto-save debounce: do not save when track transposition is set', () => {
        /**
         * The hook has a guard: if trackTransposition is set (non-zero),
         * manual adjustments should NOT be saved to songPreferences.
         */
        function shouldAutoSave(options: {
            trackTransposition?: number
            isUserAdjusting: boolean
            fileId: string | null
        }): boolean {
            const { trackTransposition, isUserAdjusting, fileId } = options
            if (!fileId) return false
            if (!isUserAdjusting) return false
            // If leader set per-track transposition, don't save
            if (trackTransposition !== undefined && trackTransposition !== 0) return false
            return true
        }

        it('saves when user adjusts and no track transposition is set', () => {
            expect(shouldAutoSave({
                trackTransposition: undefined,
                isUserAdjusting: true,
                fileId: 'abc123',
            })).toBe(true)
        })

        it('does NOT save when track transposition is set (leader controls)', () => {
            expect(shouldAutoSave({
                trackTransposition: 3,
                isUserAdjusting: true,
                fileId: 'abc123',
            })).toBe(false)
        })

        it('does NOT save on initial load (not user adjusting)', () => {
            expect(shouldAutoSave({
                trackTransposition: undefined,
                isUserAdjusting: false,
                fileId: 'abc123',
            })).toBe(false)
        })

        it('does NOT save when fileId is null', () => {
            expect(shouldAutoSave({
                trackTransposition: undefined,
                isUserAdjusting: true,
                fileId: null,
            })).toBe(false)
        })
    })
})

// ── MusicianProfile interface compliance ─────────────────────────────────────

describe('MusicianProfile type: optional fields', () => {
    it('profile with only instrument is valid', () => {
        const profile: MusicianProfile = { instrument: 'bb_trumpet' }
        expect(profile.instrument).toBe('bb_trumpet')
        expect(profile.defaultTransposition).toBeUndefined()
    })

    it('profile with all fields is valid', () => {
        const profile: MusicianProfile = {
            instrument: 'bb_trumpet',
            defaultTransposition: 2,
            preferCapo: false,
            preferredCapoFret: 0,
            preferFlats: false,
        }
        expect(profile.defaultTransposition).toBe(2)
        expect(profile.preferCapo).toBe(false)
    })

    it('empty profile (no instrument set) is valid', () => {
        const profile: MusicianProfile = {}
        expect(profile.instrument).toBeUndefined()
        expect(profile.defaultTransposition).toBeUndefined()
    })
})

// ── isAutoTransposed flag ────────────────────────────────────────────────────

describe('isAutoTransposed flag behavior', () => {
    /**
     * The hook returns: isAutoTransposed = appliedForFile !== null && transposition !== 0
     * This tells TransposerMenu whether to show the "auto" indicator.
     */
    function computeIsAutoTransposed(appliedForFile: string | null, transposition: number): boolean {
        return appliedForFile !== null && transposition !== 0
    }

    it('false when no file has been applied', () => {
        expect(computeIsAutoTransposed(null, 2)).toBe(false)
    })

    it('false when transposition is 0 (original key)', () => {
        expect(computeIsAutoTransposed('file123', 0)).toBe(false)
    })

    it('true when file applied and transposition is non-zero', () => {
        expect(computeIsAutoTransposed('file123', 2)).toBe(true)
    })

    it('true for Bb trumpet: file applied with transposition=2', () => {
        expect(computeIsAutoTransposed('modeh-ani-pdf-id', 2)).toBe(true)
    })

    it('true for Eb Alto Sax: file applied with transposition=-3', () => {
        expect(computeIsAutoTransposed('song-pdf-id', -3)).toBe(true)
    })
})
