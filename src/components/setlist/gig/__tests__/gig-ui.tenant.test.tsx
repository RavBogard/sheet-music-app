import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { OrgProvider } from '@/lib/org/org-context'
import { codeOrgConfig } from '@/lib/org/config-code'
import type { SetlistTrack } from '@/types/models'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { SetlistGrid } from '@/components/setlist/grid/SetlistGrid'
import { SetlistView } from '@/components/performance/SetlistView'

/**
 * BET-5 (B5b): the band UI renders for a band tenant and CRC's editor and
 * Perform list stay as they were: no gig line, no length fields, no segue
 * toggles, no set lengths, unless a row carries a length.
 */

const CRC = codeOrgConfig('crc')!
const BL = codeOrgConfig('brotherslazaroff')!

function inOrg(org: 'crc' | 'brotherslazaroff', ui: ReactElement) {
    return render(<OrgProvider orgId={org} config={org === 'crc' ? CRC : BL}>{ui}</OrgProvider>)
}

async function seed(setlistId: string, rows: Partial<LocalTrack>[], setlist: Record<string, unknown> = {}) {
    const db = getDb()
    await db.setlists.put({ id: setlistId, ownerId: 'u1', updatedAt: 1, name: 'Show', ...setlist })
    await db.tracks.bulkPut(
        rows.map((r, i) => ({ id: r.id ?? `${setlistId}-${i}`, setlistId, order: i, ...r })) as LocalTrack[],
    )
}

const ROWS: Partial<LocalTrack>[] = [
    { id: 'h1', type: 'header', title: 'Set 1' },
    { id: 's1', type: 'song', title: 'Opener', key: 'G', leadMusician: 'Sam', singerKeys: [{ musician: 'Sam', key: 'Bb' }] },
    { id: 's2', type: 'song', title: 'Closer', key: 'D' },
]

describe('BET-5 band UI by tenant: the setlist editor', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('CRC without lengths: no gig line, no length fields, no segue toggles, no set lengths, no total', async () => {
        await seed('crc-1', ROWS.map(({ singerKeys: _s, ...r }) => r))
        inOrg('crc', <SetlistGrid setlistId="crc-1" name="Friday" />)
        await screen.findByText('Opener')
        expect(screen.queryByTestId('gig-panel')).not.toBeInTheDocument()
        expect(screen.queryAllByTestId('row-duration')).toHaveLength(0)
        expect(screen.queryAllByTestId('row-segue')).toHaveLength(0)
        expect(screen.queryAllByTestId('set-total')).toHaveLength(0)
        expect(screen.getByTestId('setlist-status-line')).not.toHaveTextContent('Total')
    })

    it('CRC once a row has a length: length fields and set lengths, still no gig line or segue toggles', async () => {
        await seed('crc-2', [ROWS[0], { id: 's1', type: 'song', title: 'Opener', durationSec: 200 }, ROWS[2]])
        inOrg('crc', <SetlistGrid setlistId="crc-2" name="Friday" />)
        await screen.findByText('Opener')
        expect(screen.getAllByTestId('row-duration')).toHaveLength(2)
        expect(screen.getByTestId('set-total')).toHaveTextContent('3:20')
        expect(screen.queryByTestId('gig-panel')).not.toBeInTheDocument()
        expect(screen.queryAllByTestId('row-segue')).toHaveLength(0)
        expect(screen.getByTestId('setlist-status-line')).toHaveTextContent('Total 3:20')
    })

    it('Brothers Lazaroff: the gig line, lengths, segues, set lengths against the target, and the lead singer key', async () => {
        await seed(
            'bl-1',
            [ROWS[0], { ...ROWS[1], durationSec: 300 }, ROWS[2]],
            { gig: { venue: 'The Hall', address: '1 Main St', loadIn: '17:00', start: '20:00', end: '23:00', setTargets: [{ headerRowId: 'h1', minutes: 4 }] } },
        )
        inOrg('brotherslazaroff', <SetlistGrid setlistId="bl-1" name="Show" />)
        await screen.findByText('Opener')
        const panel = await screen.findByTestId('gig-panel')
        expect(panel).toHaveTextContent('The Hall · 1 Main St')
        expect(panel).toHaveTextContent('Load-in 17:00')
        expect(within(panel).getByRole('button', { name: 'Edit gig details' })).toBeInTheDocument()
        expect(screen.getAllByTestId('row-duration')).toHaveLength(2)
        expect(screen.getAllByTestId('row-segue')).toHaveLength(2)
        const total = screen.getByTestId('set-total')
        expect(total).toHaveAttribute('data-over')
        expect(within(total).getByTestId('set-total-over')).toHaveTextContent('1:00 over')
        expect(within(total).getByTestId('set-total-untimed')).toHaveTextContent('1 untimed')
        expect(screen.getByTestId('row-key-s1')).toHaveTextContent('Bb')
        expect(screen.getByTestId('row-key-s1')).toHaveAttribute('data-lead-key')
        expect(screen.getByTestId('row-key-s2')).toHaveTextContent('D')
        expect(screen.getByTestId('setlist-status-line')).toHaveTextContent('Total 5:00')
    })

    it('Brothers Lazaroff with no gig yet offers to add it', async () => {
        await seed('bl-2', ROWS)
        inOrg('brotherslazaroff', <SetlistGrid setlistId="bl-2" name="Show" />)
        await screen.findByText('Opener')
        expect(await screen.findByRole('button', { name: 'Add gig details' })).toBeInTheDocument()
    })

    it('a typed length and the segue toggle save to the row; text that is not a length is refused', async () => {
        await seed('bl-3', ROWS)
        inOrg('brotherslazaroff', <SetlistGrid setlistId="bl-3" name="Show" />)
        await screen.findByText('Opener')
        const field = screen.getByRole('textbox', { name: 'Length of Opener' })
        await act(async () => {
            fireEvent.change(field, { target: { value: '3:45' } })
            fireEvent.blur(field)
        })
        await waitFor(async () => expect((await getDb().tracks.get('s1'))?.durationSec).toBe(225))

        const closer = screen.getByRole('textbox', { name: 'Length of Closer' })
        await act(async () => {
            fireEvent.change(closer, { target: { value: 'soon' } })
            fireEvent.blur(closer)
        })
        expect(closer).toHaveAttribute('aria-invalid', 'true')
        expect((await getDb().tracks.get('s2'))?.durationSec).toBeUndefined()

        const [segue] = screen.getAllByRole('button', { name: 'Runs straight into the next song' })
        expect(segue).toHaveAttribute('aria-pressed', 'false')
        await act(async () => {
            fireEvent.click(segue)
        })
        await waitFor(async () => expect((await getDb().tracks.get('s1'))?.segue).toBe(true))
    })
})

describe('BET-5 band UI by tenant: the Perform setlist', () => {
    const tracks = [
        { id: 'h1', type: 'header', title: 'Set 1' },
        { id: 's1', type: 'song', title: 'Opener', key: 'G', leadMusician: 'Sam', segue: true, durationSec: 240, singerKeys: [{ musician: 'Sam', key: 'Bb' }] },
        { id: 's2', type: 'song', title: 'Closer', key: 'D' },
    ] as unknown as SetlistTrack[]
    const props = {
        currentTrackIndex: -1,
        defaultTransposition: 0,
        isPublicView: true,
        isLeader: false,
        onSongTap: () => {},
        onLeaderSetPosition: () => {},
    }

    it('CRC without lengths: no set lengths', () => {
        const plain = tracks.map(({ durationSec: _d, segue: _s, ...t }) => t) as SetlistTrack[]
        inOrg('crc', <SetlistView tracks={plain} {...props} />)
        expect(screen.queryAllByTestId('set-total')).toHaveLength(0)
        expect(screen.queryAllByTestId('perform-segue')).toHaveLength(0)
    })

    it('a band set: the set length, the segue mark between the two songs, and the lead singer key', () => {
        inOrg('brotherslazaroff', <SetlistView tracks={tracks} {...props} showTiming gig={{ setTargets: [{ minutes: 5 }] }} />)
        expect(screen.getByTestId('set-total')).toHaveTextContent('4:00')
        expect(screen.getByTestId('set-total')).toHaveTextContent('target 5:00')
        expect(screen.getByRole('img', { name: 'Runs straight into the next song' })).toBeInTheDocument()
        const keys = screen.getAllByTestId('key-badge')
        expect(keys[0]).toHaveTextContent('Bb')
        expect(keys[1]).toHaveTextContent('D')
    })
})
