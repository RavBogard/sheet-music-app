import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    // Pin time to a known point to avoid timezone edge cases
    // Wednesday March 4, 2026 at 10:00 AM local time
    const FIXED_NOW = new Date(2026, 2, 4, 10, 0, 0, 0)

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(FIXED_NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns "Today" for today (morning)', () => {
        const result = getRelativeDateLabel(FIXED_NOW)
        expect(result).toBe('Today')
    })

    it('returns "Tomorrow" for tomorrow', () => {
        // March 5, 2026 at noon
        const tomorrow = new Date(2026, 2, 5, 12, 0, 0, 0)
        const result = getRelativeDateLabel(tomorrow)
        expect(result).toBe('Tomorrow')
    })

    it('returns weekday name for dates within the week', () => {
        // March 7, 2026 (Saturday) — 3 days from the fixed Wednesday
        const inThreeDays = new Date(2026, 2, 7, 12, 0, 0, 0)
        const result = getRelativeDateLabel(inThreeDays)
        expect(result).toBe('Saturday')
    })

    it('returns formatted date for dates further out', () => {
        // March 18, 2026 — 14 days out
        const farFuture = new Date(2026, 2, 18, 12, 0, 0, 0)
        const result = getRelativeDateLabel(farFuture)
        expect(result).toBeTruthy()
        expect(result).not.toBe('Tomorrow')
    })

    it('returns null for invalid input', () => {
        expect(getRelativeDateLabel(null)).toBeNull()
    })
})
