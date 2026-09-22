import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// David's ask 2 (2026-09-22): the pickers offer THIS site's charts — the
// host org — whatever else the account may read; CRC opens on core with the
// library's collection chips; an admin can add other sites for one open.

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}

const authState = { isAdmin: false }
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: null, isAdmin: authState.isAdmin, isBandLeader: authState.isAdmin }),
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

const SONGS = [
    { id: 'crc-core', title: 'Adon Olam (core)', orgId: 'crc', collection: 'core' },
    { id: 'crc-legacy', title: 'Bar’chu (legacy core)', collection: undefined },
    { id: 'crc-supp', title: 'Hashkivenu (Shireinu)', orgId: 'crc', collection: 'supplemental' },
    { id: 'crc-nava', title: 'Lecha Dodi (Nava)', orgId: 'crc', collection: 'nava' },
    { id: 'crc-up', title: 'Modah Ani (upload)', orgId: 'crc', collection: 'uploads' },
    { id: 'crc-dup', title: 'Oseh Shalom (duplicate)', orgId: 'crc', collection: 'core', status: 'duplicate' },
    { id: 'bl-1', title: 'Pink Supermoon', orgId: 'brotherslazaroff', collection: 'uploads' },
    { id: 'bl-2', title: 'We Still Stand', orgId: 'brotherslazaroff', collection: 'uploads' },
] as const

async function seed() {
    await getDb().songs.bulkPut(
        SONGS.map((s) => ({
            id: s.id,
            title: s.title,
            normalizedTitle: s.title.toLowerCase(),
            ...('orgId' in s && s.orgId ? { orgId: s.orgId } : {}),
            ...('status' in s ? { status: s.status } : {}),
        })),
    )
    useLibraryStore.getState().hydrate(
        SONGS.map(
            (s) =>
                ({
                    id: s.id,
                    name: s.title,
                    mimeType: 'application/pdf',
                    collection: s.collection ?? 'core',
                }) as DriveFile,
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

const listed = () =>
    Array.from(document.querySelectorAll('[cmdk-item]'))
        .map((el) => el.getAttribute('data-value') ?? '')
        .sort()

describe('chart picker tenant + collection scope', () => {
    beforeEach(async () => {
        await resetDbForTests()
        useLibraryStore.getState().hydrate([])
        authState.isAdmin = false
    })
    afterEach(async () => {
        vi.unstubAllGlobals()
        await resetDbForTests()
    })

    it('on brotherslazaroff.live, lists only Brothers Lazaroff charts and no chips', async () => {
        await seed()
        await openOn('brotherslazaroff')
        await screen.findByText('Pink Supermoon')
        expect(listed()).toEqual(['Pink Supermoon', 'We Still Stand'])
        // One collection only → no chips (and so no Shireinu chip).
        expect(screen.queryByTestId('picker-scope-bar')).not.toBeInTheDocument()
    })

    it('on CRC, opens on core with four chips, and Shireinu shows exactly the supplemental rows', async () => {
        await seed()
        await openOn('crc')
        await screen.findByText('Adon Olam')
        const chips = Array.from(document.querySelectorAll('[data-collection]')).map((b) => b.textContent)
        expect(chips).toEqual(['CRC Charts', 'Shireinu', 'Nava Tehilah', 'Uploads'])
        expect(screen.getByRole('button', { name: 'CRC Charts' })).toHaveAttribute('aria-pressed', 'true')
        // core = tagged core + legacy (no collection); duplicate hidden; no BL.
        expect(listed()).toEqual(['Adon Olam (core)', 'Bar’chu (legacy core)'])

        await userEvent.click(screen.getByRole('button', { name: 'Shireinu' }))
        await waitFor(() => expect(listed()).toEqual(['Hashkivenu (Shireinu)']))

        // Tapping the active chip lifts the filter: every CRC chart, still no BL, no duplicate.
        await userEvent.click(screen.getByRole('button', { name: 'Shireinu' }))
        await waitFor(() => expect(listed()).toHaveLength(5))
        expect(listed().some((t) => t.includes('Pink'))).toBe(false)
        expect(listed().some((t) => t.includes('duplicate'))).toBe(false)
    })

    it('non-admins get no "include other sites" control', async () => {
        await seed()
        await openOn('brotherslazaroff')
        await screen.findByText('Pink Supermoon')
        expect(screen.queryByTestId('picker-other-sites')).not.toBeInTheDocument()
    })

    it('an admin can include other sites for this open only, through the authorised route', async () => {
        authState.isAdmin = true
        const fetchSpy = vi.fn(async (_url: string) =>
            new Response(
                JSON.stringify({
                    files: [
                        { id: 'crc-core', name: 'Adon Olam (core)', mimeType: 'application/pdf', status: 'active', orgId: 'crc' },
                        { id: 'crc-dup', name: 'Oseh Shalom (duplicate)', mimeType: 'application/pdf', status: 'duplicate', orgId: 'crc' },
                        { id: 'bl-1', name: 'Pink Supermoon', mimeType: 'application/pdf', status: 'active', orgId: 'brotherslazaroff' },
                    ],
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        )
        vi.stubGlobal('fetch', fetchSpy)
        await seed()
        await openOn('brotherslazaroff')
        await screen.findByText('Pink Supermoon')
        const toggle = screen.getByTestId('picker-other-sites')
        expect(toggle).toHaveAttribute('aria-checked', 'false')
        expect(fetchSpy).not.toHaveBeenCalled()

        await userEvent.click(toggle)
        expect(await screen.findByText('Other sites')).toBeInTheDocument()
        expect(String(fetchSpy.mock.calls[0][0])).toContain('allSites=true')
        const other = Array.from(document.querySelectorAll('[data-other-site]')).map((el) => el.getAttribute('data-other-site'))
        expect(other).toEqual(['crc']) // the CRC chart, not the duplicate, not BL's own

        // Close and reopen: the control is off again.
        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByTestId('chart-bind-popover')).not.toBeInTheDocument())
        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByText('Pink Supermoon')
        expect(screen.getByTestId('picker-other-sites')).toHaveAttribute('aria-checked', 'false')
        expect(screen.queryByText('Other sites')).not.toBeInTheDocument()
    })
})
