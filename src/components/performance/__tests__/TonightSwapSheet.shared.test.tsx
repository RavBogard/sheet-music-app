import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5: Swap for tonight with a shared chart. Own charts
// first, exactly as before; a shared collection is an opt-in chip; its rows
// follow the site's own in each section, labelled with the owner, and a
// swap to one is recorded by fileId like any other.

const STABLE_USER = vi.hoisted(() => ({ uid: 'u1' }))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: STABLE_USER, isAdmin: false, isBandLeader: true }),
}))
vi.mock('@/components/setlist/grid/ChartThumb', () => ({
    ChartThumb: () => <span data-testid="thumb" />,
}))
const commitTonightSwap = vi.hoisted(() => vi.fn(async () => ({ kind: 'ok' })))
vi.mock('@/lib/performance/tonight-client', () => ({
    commitTonightSwap,
    fetchMomentFileIds: vi.fn(async () => new Set<string>()),
}))
vi.mock('@/lib/live-director', () => ({ swapTrackChart: vi.fn() }))

import { setSharedSourceForTests, toSharedFile, type SharedSource } from '@/lib/library/shared-source'
import { useLibraryStore } from '@/lib/library-store'
import { OrgProvider } from '@/lib/org/org-context'
import type { DriveFile, SetlistTrack } from '@/types/models'

import { TonightSwapSheet } from '../TonightSwapSheet'

const BL_FILES: DriveFile[] = [
    { id: 'b1', name: 'Lecha Dodi Nigun (Nava)', mimeType: 'application/pdf', collection: 'uploads', orgId: 'brotherslazaroff' },
    { id: 'b2', name: 'Pink Supermoon', mimeType: 'application/pdf', collection: 'core', orgId: 'brotherslazaroff' },
]
const SHARED = toSharedFile('c1', {
    name: 'Lecha Dodi (Friedman)',
    mimeType: 'application/pdf',
    orgId: 'crc',
    collection: 'core',
    collectionId: 'crc__core',
    visibleToOrgs: ['crc', 'brotherslazaroff'],
    metadata: { key: 'D' },
})!

const planned: SetlistTrack = { id: 'row-1', title: 'Lecha Dodi', fileId: 'b0', mimeType: 'application/pdf' }

function openSheet() {
    render(
        <OrgProvider orgId="brotherslazaroff">
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

const titles = (region: string) =>
    within(screen.getByRole('region', { name: region }))
        .getAllByTestId('tonight-swap-candidate')
        .map((b) => b.textContent)

describe('Swap for tonight: shared chart', () => {
    let source: SharedSource & { listSharedRows: ReturnType<typeof vi.fn> }
    beforeEach(() => {
        localStorage.clear()
        commitTonightSwap.mockClear()
        useLibraryStore.getState().hydrate(BL_FILES)
        source = {
            listCollections: vi.fn(async () => [{ id: 'crc__core', ownerOrgId: 'crc', name: 'core', label: 'CRC Charts' }]),
            listSharedRows: vi.fn(async () => [SHARED]),
            ownerName: vi.fn(async () => null),
        }
        setSharedSourceForTests(source)
    })
    afterEach(() => {
        cleanup()
        setSharedSourceForTests(null)
    })

    it('chip off by default: the sheet is the site library only', async () => {
        openSheet()
        const chip = await screen.findByTestId('swap-shared-chip')
        expect(chip).toHaveAttribute('aria-pressed', 'false')
        expect(chip).toHaveTextContent('CRC ChartsFrom CRC Music')
        expect(screen.queryByRole('region', { name: 'Same title' })).toBeNull()
        await userEvent.type(screen.getByLabelText("Search this site's library"), 'dodi')
        expect(titles('Search')).toEqual(['Lecha Dodi Nigun (Nava)Uploads'])
        expect(source.listSharedRows).not.toHaveBeenCalled()
    })

    it('chip on: the shared chart follows the own ones, labelled, and swaps by fileId', async () => {
        openSheet()
        await userEvent.click(await screen.findByTestId('swap-shared-chip'))
        await waitFor(() =>
            expect(titles('Same title')).toEqual(['Lecha Dodi (Friedman)From CRC Music · D']),
        )
        await userEvent.type(screen.getByLabelText("Search this site's library"), 'dodi')
        expect(titles('Search')).toEqual(['Lecha Dodi Nigun (Nava)Uploads', 'Lecha Dodi (Friedman)From CRC Music · D'])

        const sharedButton = within(screen.getByRole('region', { name: 'Same title' })).getByRole('button', {
            name: 'Swap to Lecha Dodi (Friedman)',
        })
        expect(sharedButton).toHaveAttribute('data-shared-from', 'crc')
        await userEvent.click(sharedButton)
        await waitFor(() => expect(commitTonightSwap).toHaveBeenCalled())
        const [, plan] = commitTonightSwap.mock.calls[0] as unknown as [string, { choice: { fileId: string; title: string; key: string } }]
        expect(plan.choice).toMatchObject({ fileId: 'c1', songId: 'c1', title: 'Lecha Dodi (Friedman)', key: 'D' })
    })

    it('the chip stays on next time it opens (remembered per user)', async () => {
        openSheet()
        await userEvent.click(await screen.findByTestId('swap-shared-chip'))
        cleanup()
        openSheet()
        expect(await screen.findByTestId('swap-shared-chip')).toHaveAttribute('aria-pressed', 'true')
        await waitFor(() => expect(titles('Same title')).toHaveLength(1))
    })
})
