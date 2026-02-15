import { describe, it, expect } from 'vitest'
import { toDate, toISOString, formatEventDate, getRelativeDateLabel } from './firestore-helpers'

describe('toDate', () => {
    it('handles Date objects', () => {
        const d = new Date('2026-03-15T12:00:00Z')
        expect(toDate(d)).toEqual(d)
    })

    it('handles ISO strings', () => {
        const result = toDate('2026-03-15T12:00:00Z')
        expect(result).toBeInstanceOf(Date)
        expect(result?.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    })

    it('handles Firestore-like objects with seconds', () => {
        // Simulates a Firestore Timestamp-like object
        const result = toDate({ seconds: 1773849600, nanoseconds: 0 })
        expect(result).toBeInstanceOf(Date)
    })

    it('handles objects with toDate method', () => {
        const mockTimestamp = {
            toDate: () => new Date('2026-03-15T12:00:00Z')
        }
        const result = toDate(mockTimestamp)
        expect(result?.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    })

    it('handles null/undefined', () => {
        expect(toDate(null)).toBeNull()
        expect(toDate(undefined)).toBeNull()
        expect(toDate('')).toBeNull()
    })

    it('handles numeric timestamps', () => {
        const ms = new Date('2026-03-15T12:00:00Z').getTime()
        const result = toDate(ms)
        expect(result?.toISOString()).toBe('2026-03-15T12:00:00.000Z')
    })
})

describe('toISOString', () => {
    it('converts dates to ISO strings', () => {
        expect(toISOString(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15T12:00:00.000Z')
    })

    it('returns null for invalid input', () => {
        expect(toISOString(null)).toBeNull()
    })
})

describe('formatEventDate', () => {
    it('formats dates as readable strings', () => {
        const result = formatEventDate('2026-03-15T12:00:00Z')
        expect(result).toBeTruthy()
        // Should contain "March" and "15"
        expect(result).toContain('March')
        expect(result).toContain('15')
    })

    it('returns null for invalid input', () => {
        expect(formatEventDate(null)).toBeNull()
    })
})

describe('getRelativeDateLabel', () => {
    it('returns "Today" or "Tonight" for today', () => {
        const now = new Date()
        const result = getRelativeDateLabel(now)
        expect(result === 'Today' || result === 'Tonight').toBe(true)
    })

    it('returns "Tomorrow" for tomorrow', () => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(12, 0, 0, 0) // Noon tomorrow
        const result = getRelativeDateLabel(tomorrow)
        expect(result).toBe('Tomorrow')
    })

    it('returns weekday name for dates within the week', () => {
        const inThreeDays = new Date()
        inThreeDays.setDate(inThreeDays.getDate() + 3)
        inThreeDays.setHours(12, 0, 0, 0)
        const result = getRelativeDateLabel(inThreeDays)
        // Should be a day name like "Monday", "Tuesday", etc.
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        expect(dayNames).toContain(result)
    })

    it('returns formatted date for dates further out', () => {
        const farFuture = new Date()
        farFuture.setDate(farFuture.getDate() + 14)
        const result = getRelativeDateLabel(farFuture)
        // Should be a full date like "Friday, March 15"
        expect(result).toBeTruthy()
        expect(result).not.toBe('Tomorrow')
    })

    it('returns null for invalid input', () => {
        expect(getRelativeDateLabel(null)).toBeNull()
    })
})
