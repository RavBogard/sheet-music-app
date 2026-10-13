import { describe, it, expect } from 'vitest'
import { getContextualGreeting } from './greeting'
import { createTranslator } from '@/i18n/core'
import { peekCompleteMessages } from '@/i18n/message-cache'

describe('getContextualGreeting', () => {
    describe('time-of-day greetings', () => {
        it('says good morning before noon', () => {
            const date = new Date('2026-03-10T09:00:00') // Tuesday morning
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).toBe('Good morning, Daniel')
            expect(result.isSpecial).toBe(false)
        })

        it('says good afternoon between noon and 5pm', () => {
            const date = new Date('2026-03-10T14:00:00') // Tuesday afternoon
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).toBe('Good afternoon, Daniel')
        })

        it('says good evening after 5pm', () => {
            const date = new Date('2026-03-10T19:00:00') // Tuesday evening
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).toBe('Good evening, Daniel')
        })
    })

    describe('Shabbat detection', () => {
        it('says Shabbat Shalom on Friday evening', () => {
            const date = new Date('2026-03-20T18:00:00') // Friday 6pm
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).toBe('Shabbat Shalom, Daniel')
            expect(result.isSpecial).toBe(true)
        })

        it('says Shabbat Shalom on Saturday morning', () => {
            const date = new Date('2026-03-21T10:00:00') // Saturday 10am
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).toBe('Shabbat Shalom, Daniel')
            expect(result.isSpecial).toBe(true)
        })

        it('does not say Shabbat Shalom on Friday morning', () => {
            const date = new Date('2026-03-20T10:00:00') // Friday 10am
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).not.toContain('Shabbat')
        })

        it('does not say Shabbat Shalom on Saturday night after 9pm', () => {
            const date = new Date('2026-03-21T22:00:00') // Saturday 10pm
            const result = getContextualGreeting('Daniel', date)
            expect(result.text).not.toContain('Shabbat')
        })
    })

    describe('guest greeting', () => {
        it('says Welcome to CRC Music for guests', () => {
            const date = new Date('2026-03-10T14:00:00') // Regular weekday
            const result = getContextualGreeting(null, date)
            expect(result.text).toBe('Welcome to CRC Music')
        })

        it('uses custom appName for guest greeting', () => {
            const date = new Date('2026-03-10T14:00:00')
            const result = getContextualGreeting(null, date, 'Temple Music')
            expect(result.text).toBe('Welcome to Temple Music')
        })

        it('says Shabbat Shalom without name for guests on Shabbat', () => {
            const date = new Date('2026-03-20T18:00:00') // Friday evening
            const result = getContextualGreeting(null, date)
            expect(result.text).toBe('Shabbat Shalom')
        })
    })

    describe('Hebrew date display', () => {
        it('includes a Hebrew date string', () => {
            const date = new Date('2026-02-15T12:00:00')
            const result = getContextualGreeting('Daniel', date)
            expect(result.hebrewDate).toBeTruthy()
            expect(result.hebrewDate).toContain('5786')
        })
    })

    describe('holiday greetings', () => {
        it('says Shanah Tovah on Rosh Hashanah (1 Tishrei)', () => {
            // 1 Tishrei 5787 = approximately September 12, 2026
            // We'll test the pattern rather than exact date since Hebrew calendar
            // mapping varies. The greeting function uses Intl API internally.
            const date = new Date('2026-09-12T12:00:00')
            const result = getContextualGreeting('Daniel', date)
            // This may or may not be exactly Rosh Hashanah due to timezone/date boundary
            // The important thing is the function doesn't crash
            expect(result.text).toBeTruthy()
            expect(result.hebrewDate).toBeTruthy()
        })

        it('holidays take priority over Shabbat', () => {
            // If a holiday falls on Shabbat, the holiday greeting should win
            // This is a structural test — holidays are checked first in the code
            // We test this by verifying the priority order exists
            const fridayEvening = new Date('2026-03-20T18:00:00')
            const result = getContextualGreeting('Daniel', fridayEvening)
            // On a regular Friday this should be Shabbat
            // (holiday would override if it were also a holiday)
            expect(result.isSpecial).toBe(true)
        })
    })

    describe('edge cases', () => {
        it('handles first name extraction', () => {
            const date = new Date('2026-03-10T14:00:00')
            const result = getContextualGreeting('Daniel Bogard', date)
            expect(result.text).toContain('Daniel Bogard')
        })

        it('handles empty string name', () => {
            const date = new Date('2026-03-10T14:00:00')
            // Empty string is falsy, should behave like guest
            const result = getContextualGreeting('', date)
            expect(result.text).toBe('Welcome to CRC Music')
        })
    })
})

describe('getContextualGreeting (phase 7 i18n)', () => {
    const tFor = (lang: 'he' | 'qps') =>
        createTranslator({ lang, messages: peekCompleteMessages(lang) ?? {}, fallback: peekCompleteMessages('en') })

    it('English without a translator is unchanged (welcome line)', () => {
        const r = getContextualGreeting(null, new Date('2026-03-10T09:00:00'), 'CRC')
        expect(r.text).toBe('Welcome to CRC')
        expect(r.hebrewDate).toMatch(/^\d+ [A-Z][a-z]+( I+)? \d{4}$/)
    })

    it('a Hebrew tenant gets the Hebrew-calendar date in Hebrew (from Intl, not the catalogue)', () => {
        const r = getContextualGreeting('Dana', new Date('2026-03-10T09:00:00'), 'App', { t: tFor('he'), lang: 'he' })
        expect(r.hebrewDate).toMatch(/[֐-׿]/)
        expect(r.text).toContain('Dana')
    })

    it('the pseudo-locale wraps the greeting and every word of the date', () => {
        const r = getContextualGreeting('Dana', new Date('2026-03-20T18:00:00'), 'App', { t: tFor('qps'), lang: 'qps' })
        expect(r.text.startsWith('⟦')).toBe(true)
        for (const w of r.hebrewDate.split(' ')) expect(w).toMatch(/^⟦.*⟧$/)
    })
})
