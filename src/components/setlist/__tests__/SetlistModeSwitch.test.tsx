import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const who = vi.hoisted(() => ({ isBandLeader: false, isAdmin: false }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => who }))
vi.mock('@/i18n/client', () => ({ useT: () => (k: string) => k.split('.').pop() }))

import { SetlistModeSwitch, isEventToday, visibleModes } from '../SetlistModeSwitch'

const NOW = new Date(2026, 10, 6, 12, 0, 0) // local Friday noon
const TODAY = new Date(2026, 10, 6, 19, 0, 0).toISOString()
const LATER = new Date(2026, 10, 13, 19, 0, 0).toISOString()

describe('visibleModes', () => {
    it('musicians never see Edit; leaders and admins do', () => {
        expect(visibleModes({ canEdit: false, eventDate: LATER, now: NOW })).toEqual(['rehearse', 'perform'])
        expect(visibleModes({ canEdit: true, eventDate: LATER, now: NOW })).toEqual(['rehearse', 'perform', 'edit'])
    })
    it('Rehearse is hidden on the service day only', () => {
        expect(visibleModes({ canEdit: true, eventDate: TODAY, now: NOW })).toEqual(['perform', 'edit'])
        expect(visibleModes({ canEdit: false, eventDate: null, now: NOW })).toEqual(['rehearse', 'perform'])
    })
    it('judges today in local time', () => {
        expect(isEventToday(new Date(2026, 10, 6, 0, 5), NOW)).toBe(true)
        expect(isEventToday(new Date(2026, 10, 7, 0, 5), NOW)).toBe(false)
    })
})

describe('SetlistModeSwitch', () => {
    afterEach(() => {
        cleanup()
        who.isBandLeader = false
        who.isAdmin = false
    })
    it('marks the current mode and links the others', () => {
        who.isBandLeader = true
        render(<SetlistModeSwitch setlistId="abc" current="perform" eventDate={LATER} />)
        expect(screen.getByTestId('mode-perform')).toHaveAttribute('aria-current', 'page')
        expect(screen.getByTestId('mode-rehearse')).toHaveAttribute('href', '/rehearse/abc')
        expect(screen.getByTestId('mode-edit')).toHaveAttribute('href', '/setlists/abc')
    })
    it('a musician gets no Edit segment', () => {
        render(<SetlistModeSwitch setlistId="abc" current="rehearse" eventDate={LATER} />)
        expect(screen.queryByTestId('mode-edit')).toBeNull()
        expect(screen.getByTestId('mode-perform')).toBeInTheDocument()
    })
})
