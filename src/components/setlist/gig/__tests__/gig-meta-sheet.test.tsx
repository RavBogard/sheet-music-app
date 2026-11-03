import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { buildGig, SetlistMetaEditSheet } from '@/components/setlist/grid/SetlistMetaEditSheet'
import { codeOrgConfig } from '@/lib/org/config-code'
import { OrgProvider } from '@/lib/org/org-context'
import type { Gig } from '@/lib/gig/model'

/** BET-5: the gig is edited in the setlist details sheet, band tenants only. */

function renderSheet(org: 'crc' | 'brotherslazaroff', gig?: Gig) {
    const applyEdit = vi.fn().mockResolvedValue(undefined)
    render(
        <OrgProvider orgId={org} config={codeOrgConfig(org)}>
            <SetlistMetaEditSheet
                setlistId="s1"
                open
                onOpenChange={() => {}}
                initial={{ name: 'Show', gig }}
                sets={[{ id: 'h1', title: 'Set 1', targetMinutes: gig?.setTargets?.[0]?.minutes }]}
                saveSetlist={applyEdit}
            />
        </OrgProvider>,
    )
    return applyEdit
}

describe('BET-5 gig fields in the details sheet', () => {
    it('CRC: no gig fields', () => {
        renderSheet('crc')
        expect(screen.queryByTestId('gig-fields')).not.toBeInTheDocument()
    })

    it('Brothers Lazaroff: sends only the changed gig PARTS (with the set target by header row), so another edit to another part is kept', async () => {
        const applyEdit = renderSheet('brotherslazaroff', { start: '20:00', venue: 'The Hall' })
        fireEvent.change(screen.getByLabelText('Load-in'), { target: { value: '17:30' } })
        fireEvent.change(screen.getByLabelText('Set 1, minutes'), { target: { value: '45' } })
        fireEvent.change(screen.getByLabelText('Venue'), { target: { value: '' } })
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }))
        })
        expect(applyEdit).toHaveBeenCalledTimes(1)
        expect(applyEdit.mock.calls[0][2]).toEqual({
            gig: { venue: null, loadIn: '17:30', setTargets: [{ headerRowId: 'h1', minutes: 45 }] },
        })
        // The base is the gig the sheet opened with.
        expect(applyEdit.mock.calls[0][1]).toMatchObject({ gig: { start: '20:00', venue: 'The Hall' } })
    })

    it('Brothers Lazaroff: an unchanged gig (keys in another order) is not rewritten', async () => {
        const applyEdit = renderSheet('brotherslazaroff', { start: '20:00', venue: 'The Hall' })
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save/i }))
        })
        expect(applyEdit).not.toHaveBeenCalled()
    })

    it('buildGig refuses a bad time or target and clears an emptied gig', () => {
        const draft = { venue: '', address: '', loadIn: '', soundcheck: '', start: '', end: '', contact: '', notes: '' }
        expect(buildGig({ ...draft, start: '25:00' }, null, null, [])).toEqual({ ok: false })
        expect(buildGig(draft, null, { h1: '0' }, [{ id: 'h1' }])).toEqual({ ok: false })
        expect(buildGig(draft, { venue: 'x' }, null, [])).toEqual({ ok: true, gig: null })
        expect(buildGig(draft, { setTargets: [{ minutes: 30 }] }, null, [])).toEqual({ ok: true, gig: { setTargets: [{ minutes: 30 }] } })
    })
})
