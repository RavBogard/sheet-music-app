import { describe, it, expect } from 'vitest'
import { VALID_TRACK_TYPES, SERVICE_FLOW_TYPES, isValidTrackType } from './validations'

describe('v5 — Track type validation', () => {
    it('VALID_TRACK_TYPES includes all 6 types', () => {
        expect(VALID_TRACK_TYPES).toEqual(['song', 'header', 'reading', 'prayer', 'transition', 'note'])
    })

    it('SERVICE_FLOW_TYPES excludes song and header', () => {
        expect(SERVICE_FLOW_TYPES).toEqual(['reading', 'prayer', 'transition', 'note'])
        expect(SERVICE_FLOW_TYPES).not.toContain('song')
        expect(SERVICE_FLOW_TYPES).not.toContain('header')
    })

    it('isValidTrackType accepts all valid types', () => {
        for (const type of VALID_TRACK_TYPES) {
            expect(isValidTrackType(type)).toBe(true)
        }
    })

    it('isValidTrackType rejects invalid types', () => {
        expect(isValidTrackType('foo')).toBe(false)
        expect(isValidTrackType('')).toBe(false)
        expect(isValidTrackType('SONG')).toBe(false)
    })
})
