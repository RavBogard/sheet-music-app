import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5: shared collections in the setlist chart pickers.

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: { uid: 'u1' }, isAdmin: false, isBandLeader: true }),
}))
vi.mock('@/lib/charts/chart-page1', async (orig) => {
    const actual = await orig<typeof import('@/lib/charts/chart-page1')>()
    return { ...actual, chartPage1Loader: () => ({ load: () => new Promise(() => {}), stats: () => ({}) }) }
})

import { setSharedSourceForTests, toSharedFile, type SharedSource } from '@/lib/library/shared-source'
import type { SharedCollection, SharedFile } from '@/lib/library/shared-collections'
import { useLibraryStore } from '@/lib/library-store'
import { getDb, resetDbForTests } from '@/lib/local/schema'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile } from '@/types/models'

import { ChartBindPopover } from '../ChartBindPopover'
import { ChartCell } from '../cells/ChartCell'

// Same fixture as ChartPickerShared.golden.test.tsx (copied, not imported, so
// the golden tests do not run twice under this file's mocks).
const GOLDEN_ROWS = [
    { id: 'c1x', title: 'Adon Olam (Friedman)', orgId: 'crc', collection: 'core' },
    { id: 'c2', title: 'Barchu (Sulzer)', orgId: 'crc', collection: 'core' },
    { id: 'c3', title: 'Hashkivenu (Shireinu)', orgId: 'crc', collection: 'supplemental' },
    { id: 'n1', title: 'Lecha Dodi (Nava)', orgId: 'crc', collection: 'nava' },
    { id: 'n2', title: 'Yedid Nefesh (Nava)', orgId: 'crc', collection: 'nava' },
    { id: 'c4', title: 'Modah Ani (upload)', orgId: 'crc', collection: 'uploads' },
    { id: 'c5', title: 'Oseh Shalom (archived)', orgId: 'crc', collection: 'core', status: 'archived' },
    { id: 'b1', title: 'Pink Supermoon', orgId: 'brotherslazaroff', collection: 'core' },
    { id: 'b2', title: 'We Still Stand', orgId: 'brotherslazaroff', collection: 'uploads' },
] as const

const CRC_CORE_RECORD: SharedCollection = { id: 'crc__core', ownerOrgId: 'crc', name: 'core', label: 'CRC Charts' }
const NAVA_RECORD: SharedCollection = { id: 'nava-tehila__nava', ownerOrgId: 'nava-tehila', name: 'nava', label: 'Nava Tehila' }

const sharedFrom = (id: string, name: string, orgId: string, collection: string, to: string[]): SharedFile =>
    toSharedFile(id, {
        name: `${name}.pdf`,
        mimeType: 'application/pdf',
        orgId,
        collection,
        collectionId: `${orgId}__${collection}`,
        visibleToOrgs: [orgId, ...to],
        status: 'active',
    })!

function fakeSource(collections: SharedCollection[], rows: SharedFile[]) {
    const source = {
        listCollections: vi.fn(async (org: string) => collections.filter((c) => c.ownerOrgId !== org)),
        listSharedRows: vi.fn(async (org: string) => rows.filter((r) => r.orgId !== org && r.visibleToOrgs.includes(org))),
        ownerName: vi.fn(async (o: string) => (o === 'nava-tehila' ? 'Nava Tehila' : null)),
    } satisfies SharedSource
    setSharedSourceForTests(source)
    return source
}

async function seedOwn(org: OrgId, rows: ReadonlyArray<(typeof GOLDEN_ROWS)[number]>) {
    await getDb().songs.bulkPut(
        rows.map((s) => ({
            id: s.id,
            title: s.title,
            normalizedTitle: s.title.toLowerCase(),
            orgId: s.orgId,
            ...('status' in s ? { status: s.status } : {}),
        })),
    )
    useLibraryStore.getState().hydrate(
        rows
            .filter((s) => s.orgId === org)
            .map((s) => ({ id: s.id, name: s.title, mimeType: 'application/pdf', collection: s.collection, orgId: s.orgId }) as DriveFile),
    )
}

async function openOn(org: OrgId, onBind = vi.fn()) {
    render(
        <OrgProvider orgId={org}>
            <ChartBindPopover onBind={onBind}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>
        </OrgProvider>,
    )
    await userEvent.click(screen.getByTestId('chart-cell'))
    await screen.findByTestId('chart-bind-popover')
    return onBind
}

const listed = () => Array.from(document.querySelectorAll('[cmdk-item]')).map((el) => el.getAttribute('data-value') ?? '')

describe('picker: shared collection chips', () => {
    beforeEach(async () => {
        await resetDbForTests()
        localStorage.clear()
        useLibraryStore.getState().hydrate([])
        useLibraryStore.getState().setSharedSectionFiles([])
    })
    afterEach(async () => {
        cleanup()
        setSharedSourceForTests(null)
        await resetDbForTests()
    })

    it('BL: CRC’s shared core is a chip, off by default; nothing shared is read until it is on', async () => {
        const src = fakeSource([CRC_CORE_RECORD], [sharedFrom('c1', 'Adon Olam (Friedman)', 'crc', 'core', ['brotherslazaroff'])])
        await seedOwn('brotherslazaroff', GOLDEN_ROWS.filter((r) => r.orgId === 'brotherslazaroff'))
        await openOn('brotherslazaroff')
        const chip = await screen.findByTestId('picker-shared-chip')
        expect(chip).toHaveTextContent('CRC Charts')
        expect(chip).toHaveAttribute('aria-pressed', 'false')
        expect(chip).toHaveAccessibleName('Show CRC Charts from CRC Music')
        await screen.findByText('Pink Supermoon')
        expect(listed()).toEqual(['Pink Supermoon', 'We Still Stand'])
        expect(src.listSharedRows).not.toHaveBeenCalled()

        await userEvent.click(chip)
        expect(chip).toHaveAttribute('aria-pressed', 'true')
        expect(await screen.findByText('Shared')).toBeInTheDocument()
        // Own rows first, then the shared row labelled with its owner.
        await waitFor(() =>
            expect(listed()).toEqual(['Pink Supermoon', 'We Still Stand', 'Adon Olam (Friedman) From CRC Music']),
        )
        expect(document.querySelector('[data-shared-owner="crc"]')).toHaveTextContent('From CRC Music')
        expect(src.listSharedRows).toHaveBeenCalledWith('brotherslazaroff')

        // Off again: the shared rows leave the list.
        await userEvent.click(chip)
        await waitFor(() => expect(listed()).toEqual(['Pink Supermoon', 'We Still Stand']))
    })

    it('the chip is remembered for this user on this site, and a shared row binds by fileId', async () => {
        fakeSource([CRC_CORE_RECORD], [sharedFrom('c1', 'Adon Olam (Friedman)', 'crc', 'core', ['brotherslazaroff'])])
        await seedOwn('brotherslazaroff', GOLDEN_ROWS.filter((r) => r.orgId === 'brotherslazaroff'))
        await openOn('brotherslazaroff')
        await userEvent.click(await screen.findByTestId('picker-shared-chip'))
        await screen.findByText('Shared')
        cleanup()

        const onBind = await openOn('brotherslazaroff')
        const chip = await screen.findByTestId('picker-shared-chip')
        expect(chip).toHaveAttribute('aria-pressed', 'true')
        const item = await waitFor(() => {
            const el = document.querySelector('[data-shared-owner="crc"]')
            expect(el).not.toBeNull()
            return el as HTMLElement
        })
        await userEvent.click(item)
        await waitFor(() => expect(onBind).toHaveBeenCalled())
        expect(onBind.mock.calls[0][0]).toMatchObject({ songId: 'c1', title: 'Adon Olam (Friedman)' })
    })

    it('CRC after the nava move: same rows, same chips, no extra chip for the nava collection', async () => {
        fakeSource(
            [NAVA_RECORD],
            [
                sharedFrom('n1', 'Lecha Dodi (Nava)', 'nava-tehila', 'nava', ['crc']),
                sharedFrom('n2', 'Yedid Nefesh (Nava)', 'nava-tehila', 'nava', ['crc']),
            ],
        )
        // Moved: the own list no longer has n1/n2; they arrive as shared rows.
        const own = GOLDEN_ROWS.filter((r) => r.orgId === 'crc' && r.collection !== 'nava')
        await seedOwn('crc', own)
        // What useLibrary does on every page (the shared rows that feed CRC's own section).
        const { loadSharedRows } = await import('@/lib/library/shared-source')
        const { sectionRows } = await import('@/lib/library/shared-collections')
        useLibraryStore.getState().setSharedSectionFiles(sectionRows((await loadSharedRows('crc', 'u1')).rows, 'crc'))

        await openOn('crc')
        await screen.findByText('Adon Olam')
        const chips = Array.from(document.querySelectorAll('[data-collection]')).map((b) => b.textContent)
        expect(chips).toEqual(['CRC Charts', 'Shireinu', 'Nava Tehilah', 'Uploads'])
        expect(screen.queryByTestId('picker-shared-chip')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Nava Tehilah' }))
        await waitFor(() => expect(listed()).toEqual(['Lecha Dodi (Nava)', 'Yedid Nefesh (Nava)']))
    })
})
