import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const featured = vi.hoisted(() => ({ map: {} as Record<string, unknown> }))
vi.mock('@/components/recordings/useFeaturedBySong', () => ({ useFeaturedBySong: () => featured.map }))

import { PerformListenLink, isServiceDayToday } from '../PerformListenLink'

const PAST = '2020-01-04T18:00:00.000Z'

describe('PerformListenLink', () => {
    afterEach(() => {
        cleanup()
        featured.map = {}
    })

    it('shows a link to the Listen page for a past setlist with a take', () => {
        featured.map = { s1: { id: 'r' } }
        render(<PerformListenLink setlistId="abc" songIds={['x', 's1']} eventDate={PAST} />)
        expect(screen.getByTestId('perform-head-listen')).toHaveAttribute('href', '/listen/abc')
    })

    it('is hidden when no song has a take', () => {
        featured.map = { other: { id: 'r' } }
        render(<PerformListenLink setlistId="abc" songIds={['x', undefined]} eventDate={PAST} />)
        expect(screen.queryByTestId('perform-head-listen')).not.toBeInTheDocument()
    })

    it('is hidden on the service day (congregation time)', () => {
        featured.map = { s1: { id: 'r' } }
        render(<PerformListenLink setlistId="abc" songIds={['s1']} eventDate={new Date().toISOString()} />)
        expect(screen.queryByTestId('perform-head-listen')).not.toBeInTheDocument()
    })

    it('judges "today" in America/Chicago, not UTC', () => {
        // 03:00 UTC on Nov 2 is still Nov 1 evening in Chicago.
        const now = new Date('2026-11-02T03:00:00Z')
        expect(isServiceDayToday('2026-11-01T20:00:00Z', now)).toBe(true)
        expect(isServiceDayToday('2026-11-02T20:00:00Z', now)).toBe(false)
        expect(isServiceDayToday(undefined, now)).toBe(false)
    })
})
