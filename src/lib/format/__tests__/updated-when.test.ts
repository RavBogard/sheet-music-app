import { describe, expect, it } from 'vitest'
import { createFormatter } from '@/i18n/format'
import { formatUpdatedWhen } from '../updated-when'

const fmt = createFormatter({ lang: 'en', timeZone: 'America/Chicago' })
// Sat Oct 31 2026, 18:00 UTC = 1:00pm Chicago
const now = Date.UTC(2026, 9, 31, 18, 0, 0)

describe('formatUpdatedWhen', () => {
    it('gives a weekday and time inside 7 days, in the tenant zone', () => {
        const fri = Date.UTC(2026, 9, 30, 21, 12, 0) // Fri 4:12pm Chicago
        expect(formatUpdatedWhen(fmt, fri, now)).toBe('Fri 4:12pm')
    })
    it('gives a short date past 7 days', () => {
        const old = Date.UTC(2026, 8, 26, 15, 0, 0)
        expect(formatUpdatedWhen(fmt, old, now)).toBe('Sep 26')
    })
})
