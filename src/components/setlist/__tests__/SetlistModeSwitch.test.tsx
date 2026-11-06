import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const who = vi.hoisted(() => ({ isBandLeader: false, isAdmin: false }))
const site = vi.hoisted(() => ({ org: 'crc' }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => who }))
vi.mock('@/lib/org/org-context', () => ({ useOrg: () => site.org }))
vi.mock('@/i18n/client', () => ({ useT: () => (k: string) => k.split('.').pop() }))

import { SetlistModeSwitch, isEventToday, visibleModes } from '../SetlistModeSwitch'

// Friday 6 Nov 2026, 12:00 in Chicago (UTC-6 in November) = 18:00Z.
const NOW = new Date('2026-11-06T18:00:00Z')
const TODAY = '2026-11-06T19:00:00.000Z'
const LATER = '2026-11-13T19:00:00.000Z'

describe('visibleModes', () => {
    it('musicians never see Edit; leaders and admins do', () => {
        expect(visibleModes({ canEdit: false, eventDate: LATER, now: NOW })).toEqual(['rehearse', 'perform'])
        expect(visibleModes({ canEdit: true, eventDate: LATER, now: NOW })).toEqual(['rehearse', 'perform', 'edit'])
    })
    it('Rehearse shows every day, the service day included', () => {
        expect(visibleModes({ canEdit: true, eventDate: TODAY, now: NOW })).toEqual(['rehearse', 'perform', 'edit'])
        expect(visibleModes({ canEdit: false, eventDate: null, now: NOW })).toEqual(['rehearse', 'perform'])
    })
})

describe('the service day is the congregation\'s day, in any timestamp shape', () => {
    it('a Firestore Timestamp-shaped eventDate', () => {
        const ts = { seconds: Date.parse(TODAY) / 1000, nanoseconds: 0 }
        expect(isEventToday(ts, 'crc', NOW)).toBe(true)
        expect(isEventToday({ toMillis: () => Date.parse(LATER) }, 'crc', NOW)).toBe(false)
    })
    it('a numeric (ms) eventDate', () => {
        expect(isEventToday(Date.parse(TODAY), 'crc', NOW)).toBe(true)
        expect(isEventToday(Date.parse(LATER), 'crc', NOW)).toBe(false)
    })
    it('Chicago time, not UTC or the device', () => {
        // 03:00Z on Nov 7 is still the evening of Nov 6 in Chicago.
        const lateEvening = new Date('2026-11-07T03:00:00Z')
        expect(isEventToday('2026-11-06T20:00:00Z', 'crc', lateEvening)).toBe(true)
        expect(isEventToday('2026-11-07T20:00:00Z', 'crc', lateEvening)).toBe(false)
    })
})

describe('SetlistModeSwitch', () => {
    afterEach(() => {
        cleanup()
        who.isBandLeader = false
        who.isAdmin = false
        site.org = 'crc'
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
    it("Edit needs the leader role in the SETLIST's tenant: another tenant's setlist offers none", () => {
        who.isBandLeader = true
        render(<SetlistModeSwitch setlistId="abc" current="perform" eventDate={LATER} setlistOrg="brotherslazaroff" />)
        expect(screen.queryByTestId('mode-edit')).toBeNull()
        cleanup()
        render(<SetlistModeSwitch setlistId="abc" current="perform" eventDate={LATER} setlistOrg="crc" />)
        expect(screen.getByTestId('mode-edit')).toBeInTheDocument()
    })
})
