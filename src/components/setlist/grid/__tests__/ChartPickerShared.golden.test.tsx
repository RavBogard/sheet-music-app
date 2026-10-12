import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5 golden (written and committed BEFORE the shared
// collections change, passing on the unchanged picker): with no sharing
// configured, CRC and BL pickers list exactly these rows and chips.

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false }),
}))
vi.mock('@/lib/charts/chart-page1', async (orig) => {
    const actual = await orig<typeof import('@/lib/charts/chart-page1')>()
    return { ...actual, chartPage1Loader: () => ({ load: () => new Promise(() => {}), stats: () => ({}) }) }
})

import { useLibraryStore } from '@/lib/library-store'
import { getDb, resetDbForTests } from '@/lib/local/schema'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile } from '@/types/models'

import { ChartBindPopover } from '../ChartBindPopover'
import { ChartCell } from '../cells/ChartCell'

export const GOLDEN_ROWS = [
    { id: 'c1', title: 'Adon Olam (Friedman)', orgId: 'crc', collection: 'core' },
    { id: 'c2', title: 'Barchu (Sulzer)', orgId: 'crc', collection: 'core' },
    { id: 'c3', title: 'Hashkivenu (Shireinu)', orgId: 'crc', collection: 'supplemental' },
    { id: 'n1', title: 'Lecha Dodi (Nava)', orgId: 'crc', collection: 'nava' },
    { id: 'n2', title: 'Yedid Nefesh (Nava)', orgId: 'crc', collection: 'nava' },
    { id: 'c4', title: 'Modah Ani (upload)', orgId: 'crc', collection: 'uploads' },
    { id: 'c5', title: 'Oseh Shalom (archived)', orgId: 'crc', collection: 'core', status: 'archived' },
    { id: 'b1', title: 'Pink Supermoon', orgId: 'brotherslazaroff', collection: 'core' },
    { id: 'b2', title: 'We Still Stand', orgId: 'brotherslazaroff', collection: 'uploads' },
] as const

async function seed() {
    await getDb().songs.bulkPut(
        GOLDEN_ROWS.map((s) => ({
            id: s.id,
            title: s.title,
            normalizedTitle: s.title.toLowerCase(),
            orgId: s.orgId,
            ...('status' in s ? { status: s.status } : {}),
        })),
    )
    // The library list is host-scoped by the server: each site sees its own rows.
    return (org: OrgId) =>
        useLibraryStore.getState().hydrate(
            GOLDEN_ROWS.filter((s) => s.orgId === org).map(
                (s) => ({ id: s.id, name: s.title, mimeType: 'application/pdf', collection: s.collection, orgId: s.orgId }) as DriveFile,
            ),
        )
}

async function openOn(org: OrgId) {
    render(
        <OrgProvider orgId={org}>
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>
        </OrgProvider>,
    )
    await userEvent.click(screen.getByTestId('chart-cell'))
    await screen.findByTestId('chart-bind-popover')
}

const listed = () => Array.from(document.querySelectorAll('[cmdk-item]')).map((el) => el.getAttribute('data-value') ?? '')
const chips = () => Array.from(document.querySelectorAll('[data-collection]')).map((b) => b.textContent)

describe('phase 5 golden: pickers with no sharing configured', () => {
    beforeEach(async () => {
        await resetDbForTests()
        useLibraryStore.getState().hydrate([])
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('CRC: four chips, opens on core; Nava Tehilah chip lists the nava rows; all CRC rows unfiltered', async () => {
        const host = await seed()
        host('crc')
        await openOn('crc')
        await screen.findByText('Adon Olam')
        expect(chips()).toEqual(['CRC Charts', 'Shireinu', 'Nava Tehilah', 'Uploads'])
        expect(listed()).toEqual(['Adon Olam (Friedman)', 'Barchu (Sulzer)'])
        await userEvent.click(screen.getByRole('button', { name: 'Nava Tehilah' }))
        await waitFor(() => expect(listed()).toEqual(['Lecha Dodi (Nava)', 'Yedid Nefesh (Nava)']))
        await userEvent.click(screen.getByRole('button', { name: 'Nava Tehilah' }))
        await waitFor(() =>
            expect(listed()).toEqual([
                'Adon Olam (Friedman)',
                'Barchu (Sulzer)',
                'Hashkivenu (Shireinu)',
                'Lecha Dodi (Nava)',
                'Modah Ani (upload)',
                'Yedid Nefesh (Nava)',
            ]),
        )
        expect(screen.queryByTestId('picker-shared-chip')).not.toBeInTheDocument()
    })

    it('BL: two chips, its own rows only', async () => {
        const host = await seed()
        host('brotherslazaroff')
        await openOn('brotherslazaroff')
        await screen.findByText('Pink Supermoon')
        expect(chips()).toEqual(['Charts', 'Uploads'])
        expect(listed()).toEqual(['Pink Supermoon', 'We Still Stand'])
        expect(screen.queryByTestId('picker-shared-chip')).not.toBeInTheDocument()
    })
})
