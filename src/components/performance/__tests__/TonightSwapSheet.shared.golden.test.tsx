import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5 golden (committed BEFORE the shared collections change,
// passing on the unchanged sheet): with no sharing configured, the Swap sheet
// offers exactly the site's own library, in these sections, with these details.

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: null, isAdmin: false, isBandLeader: true }),
}))
vi.mock('@/components/setlist/grid/ChartThumb', () => ({
    ChartThumb: () => <span data-testid="thumb" />,
}))
vi.mock('@/lib/performance/tonight-client', () => ({
    commitTonightSwap: vi.fn(),
    fetchMomentFileIds: vi.fn(async () => new Set<string>()),
}))
vi.mock('@/lib/live-director', () => ({ swapTrackChart: vi.fn() }))

import { useLibraryStore } from '@/lib/library-store'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile, SetlistTrack } from '@/types/models'

import { TonightSwapSheet } from '../TonightSwapSheet'

const CRC_FILES: DriveFile[] = [
    { id: 'c1', name: 'Lecha Dodi (Friedman)', mimeType: 'application/pdf', collection: 'core', metadata: { key: 'D' } },
    { id: 'n1', name: 'Lecha Dodi (Nava)', mimeType: 'application/pdf', collection: 'nava' },
    { id: 'c3', name: 'Lecha Dodi (Shireinu)', mimeType: 'application/pdf', collection: 'supplemental' },
    { id: 'c4', name: 'Adon Olam', mimeType: 'application/pdf', collection: 'core' },
]
const BL_FILES: DriveFile[] = [
    { id: 'b1', name: 'Lecha Dodi Nigun (Nava)', mimeType: 'application/pdf', collection: 'uploads' },
    { id: 'b2', name: 'Pink Supermoon', mimeType: 'application/pdf', collection: 'core' },
]

const planned: SetlistTrack = { id: 'row-1', title: 'Lecha Dodi', fileId: 'c0', mimeType: 'application/pdf' }

function openSheet(org: OrgId) {
    render(
        <OrgProvider orgId={org}>
            <TonightSwapSheet
                open
                onOpenChange={vi.fn()}
                setlistId="s1"
                track={planned}
                planned={planned}
                serviceDay="2026-10-16"
            />
        </OrgProvider>,
    )
}

const candidates = () =>
    screen.getAllByTestId('tonight-swap-candidate').map((b) => b.textContent)

describe('phase 5 golden: Swap for tonight with no sharing configured', () => {
    beforeEach(() => useLibraryStore.getState().hydrate([]))

    it('CRC: same-title and search sections list the site library with collection labels', async () => {
        useLibraryStore.getState().hydrate(CRC_FILES)
        openSheet('crc')
        const stem = screen.getByRole('region', { name: 'Same title' })
        expect(within(stem).getAllByTestId('tonight-swap-candidate').map((b) => b.textContent)).toEqual([
            'Lecha Dodi (Friedman)CRC Charts · D',
            'Lecha Dodi (Nava)Nava Tehilah',
            'Lecha Dodi (Shireinu)Shireinu',
        ])
        await userEvent.type(screen.getByLabelText("Search this site's library"), 'o')
        const search = screen.getByRole('region', { name: 'Search' })
        expect(within(search).getAllByTestId('tonight-swap-candidate').map((b) => b.textContent)).toEqual([
            'Adon OlamCRC Charts',
            'Lecha Dodi (Friedman)CRC Charts · D',
            'Lecha Dodi (Nava)Nava Tehilah',
            'Lecha Dodi (Shireinu)Shireinu',
        ])
        expect(screen.queryByTestId('swap-shared-chip')).not.toBeInTheDocument()
    })

    it('BL: its own rows only', async () => {
        useLibraryStore.getState().hydrate(BL_FILES)
        openSheet('brotherslazaroff')
        await userEvent.type(screen.getByLabelText("Search this site's library"), 'n')
        expect(candidates()).toEqual(['Lecha Dodi Nigun (Nava)Uploads', 'Pink SupermoonCharts'])
        expect(screen.queryByTestId('swap-shared-chip')).not.toBeInTheDocument()
    })
})
