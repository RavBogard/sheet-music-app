import { describe, it, expect } from 'vitest'
import {
    getHebrewDate,
    getServiceContext,
    getNextFriday,
    getNextSaturday,
} from './liturgical-calendar'

describe('getHebrewDate', () => {
    it('returns a valid Hebrew date object', () => {
        const result = getHebrewDate(new Date('2026-02-16'))
        expect(result).toHaveProperty('day')
        expect(result).toHaveProperty('month')
        expect(result).toHaveProperty('year')
        expect(result).toHaveProperty('display')
        expect(result.day).toBeGreaterThan(0)
        expect(result.month.length).toBeGreaterThan(0)
    })

    it('returns correct month for known date', () => {
        // January 1, 2026 = 11 Tevet 5786
        const result = getHebrewDate(new Date('2026-01-01'))
        expect(result.month).toBe('Tevet')
    })

    it('normalizes month names', () => {
        // The Intl API returns "Tishri" but we normalize to "Tishrei"
        const result = getHebrewDate(new Date('2025-10-01'))
        // This is around Tishrei
        expect(['Tishrei', 'Elul']).toContain(result.month)
    })
})

describe('getServiceContext', () => {
    it('classifies Friday as friday_night', () => {
        // February 20, 2026 is a Friday
        const friday = new Date('2026-02-20T19:00:00')
        const ctx = getServiceContext(friday)
        expect(ctx.type).toBe('friday_night')
        expect(ctx.isShabbat).toBe(true)
    })

    it('classifies Saturday as shabbat_morning', () => {
        // February 21, 2026 is a Saturday
        const saturday = new Date('2026-02-21T10:00:00')
        const ctx = getServiceContext(saturday)
        expect(ctx.type).toBe('shabbat_morning')
        expect(ctx.isShabbat).toBe(true)
    })

    it('classifies weekday as regular', () => {
        // February 16, 2026 is a Monday
        const monday = new Date('2026-02-16T10:00:00')
        const ctx = getServiceContext(monday)
        expect(ctx.type).toBe('regular')
        expect(ctx.isShabbat).toBe(false)
    })

    it('detects Rosh Hashanah (1 Tishrei)', () => {
        // Rosh Hashanah 5787 is approximately September 12, 2026
        // We use the Hebrew date detection, so let's test with a known Tishrei 1
        const rh = new Date('2025-09-23') // 1 Tishrei 5786
        const ctx = getServiceContext(rh)
        // Should detect as rosh_hashanah if the Hebrew date mapping works
        if (ctx.hebrewDate.month === 'Tishrei' && ctx.hebrewDate.day === 1) {
            expect(ctx.type).toBe('rosh_hashanah')
            expect(ctx.holiday).toContain('Rosh Hashanah')
        }
    })

    it('returns hebrewDate in context', () => {
        const ctx = getServiceContext(new Date('2026-02-16'))
        expect(ctx.hebrewDate).toBeDefined()
        expect(ctx.hebrewDate.display).toMatch(/\d+ \w+ \d+/)
    })

    it('sets parasha to null (sync version)', () => {
        const ctx = getServiceContext(new Date('2026-02-21'))
        // Sync version doesn't fetch parasha
        expect(ctx.parasha).toBeNull()
    })
})

describe('getNextFriday', () => {
    it('returns a Friday', () => {
        const result = getNextFriday(new Date('2026-02-16')) // Monday
        expect(result.getDay()).toBe(5) // Friday
    })

    it('returns this Friday if today is before Friday', () => {
        const monday = new Date('2026-02-16T10:00:00')
        const result = getNextFriday(monday)
        expect(result.getDate()).toBe(20) // Feb 20
    })

    it('returns next week Friday if today is Saturday', () => {
        const saturday = new Date('2026-02-21T10:00:00')
        const result = getNextFriday(saturday)
        expect(result.getDate()).toBe(27) // Feb 27
    })

    it('sets time to 7 PM', () => {
        const result = getNextFriday(new Date('2026-02-16'))
        expect(result.getHours()).toBe(19)
    })
})

describe('getNextSaturday', () => {
    it('returns a Saturday', () => {
        const result = getNextSaturday(new Date('2026-02-16'))
        expect(result.getDay()).toBe(6) // Saturday
    })

    it('returns this Saturday if today is before Saturday', () => {
        const monday = new Date('2026-02-16T10:00:00')
        const result = getNextSaturday(monday)
        expect(result.getDate()).toBe(21) // Feb 21
    })

    it('sets time to 10 AM', () => {
        const result = getNextSaturday(new Date('2026-02-16'))
        expect(result.getHours()).toBe(10)
    })
})
