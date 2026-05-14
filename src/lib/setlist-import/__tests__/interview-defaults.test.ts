import { describe, it, expect } from 'vitest'

import {
    suggestServiceDate,
    inferServiceType,
    toDateInputValue,
} from '../interview-defaults'

describe('suggestServiceDate', () => {
    it('parses "Month Day" with an ordinal suffix', () => {
        const d = suggestServiceDate('May 15th Shir Shabbat .docx')
        expect(d).not.toBeNull()
        expect(d!.getMonth()).toBe(4) // May
        expect(d!.getDate()).toBe(15)
        expect(d!.getFullYear()).toBe(new Date().getFullYear())
    })

    it('parses an abbreviated month with no ordinal', () => {
        const d = suggestServiceDate('Sept 3 service outline.pdf')
        expect(d).not.toBeNull()
        expect(d!.getMonth()).toBe(8) // September
        expect(d!.getDate()).toBe(3)
    })

    it('parses a separator between month and day', () => {
        const d = suggestServiceDate('December-24-eve.txt')
        expect(d).not.toBeNull()
        expect(d!.getMonth()).toBe(11) // December
        expect(d!.getDate()).toBe(24)
    })

    it('returns null when no date token is present', () => {
        expect(suggestServiceDate('Shabbat Service.docx')).toBeNull()
    })

    it('returns null for a calendar-overflow day', () => {
        expect(suggestServiceDate('February 30 oops.docx')).toBeNull()
    })
})

describe('inferServiceType', () => {
    it('detects Rosh Hashanah', () => {
        expect(inferServiceType('Rosh Hashanah Morning Service')).toBe('rosh_hashanah')
    })

    it('detects Yom Kippur (including Kol Nidre)', () => {
        expect(inferServiceType('Kol Nidre evening')).toBe('yom_kippur')
    })

    it('detects festivals', () => {
        expect(inferServiceType('Sukkot celebration outline')).toBe('festival')
    })

    it('maps CRC "Shir Shabbat" to friday_night', () => {
        expect(inferServiceType('May 15th Shir Shabbat')).toBe('friday_night')
    })

    it('detects a generic Friday-night service', () => {
        expect(inferServiceType('Friday evening kabbalat shabbat')).toBe('friday_night')
    })

    it('detects a Shabbat-morning service', () => {
        expect(inferServiceType('Shabbat Morning Torah Service')).toBe('shabbat_morning')
    })

    it('falls back to "other" when nothing matches', () => {
        expect(inferServiceType('Community sing-along')).toBe('other')
    })
})

describe('toDateInputValue', () => {
    it('formats a Date as yyyy-mm-dd with zero padding', () => {
        expect(toDateInputValue(new Date(2026, 4, 5))).toBe('2026-05-05')
    })
})
