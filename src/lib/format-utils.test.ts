import { describe, it, expect } from 'vitest'
import { formatDuration, formatPlaybackTime } from './format-utils'

describe('formatDuration', () => {
    it('formats seconds under a minute', () => {
        expect(formatDuration(0)).toBe('0s')
        expect(formatDuration(5)).toBe('5s')
        expect(formatDuration(59)).toBe('59s')
    })

    it('formats minutes under an hour', () => {
        expect(formatDuration(60)).toBe('1m')
        expect(formatDuration(120)).toBe('2m')
        expect(formatDuration(3599)).toBe('59m')
    })

    it('formats hours and minutes', () => {
        expect(formatDuration(3600)).toBe('1h 0m')
        expect(formatDuration(5400)).toBe('1h 30m')
        expect(formatDuration(7200)).toBe('2h 0m')
    })
})

describe('formatPlaybackTime', () => {
    it('formats zero', () => {
        expect(formatPlaybackTime(0)).toBe('0:00')
    })

    it('pads seconds with leading zero', () => {
        expect(formatPlaybackTime(5)).toBe('0:05')
        expect(formatPlaybackTime(9.8)).toBe('0:09')
    })

    it('formats minutes and seconds', () => {
        expect(formatPlaybackTime(65)).toBe('1:05')
        expect(formatPlaybackTime(130)).toBe('2:10')
        expect(formatPlaybackTime(600)).toBe('10:00')
    })
})
