import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5: the library page with shared collections - CRC's
// "Nava Tehilah" tab before and after the nava move (ruling 6), and opt-in
// chips for other shared collections.

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: (opts: { count: number }) => ({
        getTotalSize: () => opts.count * 64,
        getVirtualItems: () =>
            Array.from({ length: opts.count }, (_, index) => ({ index, key: index, size: 64, start: index * 64 })),
        measure: vi.fn(),
        measureElement: vi.fn(),
        scrollToIndex: vi.fn(),
    }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
vi.mock('@/lib/store', () => ({
    useMusicStore: Object.assign(() => ({ setFile: vi.fn() }), { getState: () => ({ setFile: vi.fn() }) }),
    FileType: {},
}))
// A stable user object, as the real auth context gives (effects depend on it).
const STABLE_USER = vi.hoisted(() => ({ uid: 'u1' }))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ isAdmin: true, isBandLeader: true, profile: {}, canUpload: false, user: STABLE_USER }),
}))
vi.mock('@/lib/congregation-store', () => ({ useCongregation: () => ({ shortName: 'CRC' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })) }))
// useLibrary's phase 5 step, without React Query: the shared rows that feed
// the tenant's own sections join the library store.
vi.mock('@/hooks/use-library', async () => {
    const { useEffect } = await import('react')
    const { useSharedSectionRows } = await import('@/hooks/use-shared-collections')
    const { useLibraryStore } = await import('@/lib/library-store')
    return {
        useLibrary: () => {
            const rows = useSharedSectionRows()
            const set = useLibraryStore((s) => s.setSharedSectionFiles)
            useEffect(() => set(rows), [rows, set])
            return { refetch: vi.fn(), isLoading: false, error: null }
        },
    }
})
vi.mock('@/hooks/use-add-to-setlist', () => ({
    useAddToSetlist: () => ({
        editableSetlists: [],
        addDirectlyToSetlist: vi.fn(),
        canAddToSetlist: false,
        openForSongs: vi.fn(),
        isOpen: false,
        setIsOpen: vi.fn(),
        loading: false,
        searchQuery: '',
        setSearchQuery: vi.fn(),
        addToSetlist: vi.fn(),
        createNewSetlist: vi.fn(),
        pendingSongs: [],
    }),
}))
vi.mock('../useLibraryActions', () => ({
    useLibraryActions: () => ({ digitizing: null, handleDigitize: vi.fn(), handleArchive: vi.fn(), handleRename: vi.fn() }),
}))
vi.mock('@/lib/cache-utils', () => ({ isFileCached: vi.fn().mockResolvedValue(false) }))
vi.mock('@/components/ui/context-menu', () => ({
    ContextMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="row">{children}</div>,
    ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div data-testid="row-menu">{children}</div>,
    ContextMenuItem: ({ children, disabled, title }: { children: React.ReactNode; disabled?: boolean; title?: string }) => (
        <div role="menuitem" aria-disabled={disabled || undefined} title={title}>
            {children}
        </div>
    ),
}))

import { setSharedSourceForTests, toSharedFile, type SharedSource } from '@/lib/library/shared-source'
import type { SharedCollection, SharedFile } from '@/lib/library/shared-collections'
import { useLibraryStore } from '@/lib/library-store'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile } from '@/types/models'

import { SongChartsLibrary } from '../SongChartsLibrary'

const f = (id: string, name: string, collection: DriveFile['collection'], orgId = 'crc'): DriveFile =>
    ({ id, name: `${name}.pdf`, mimeType: 'application/pdf', collection, orgId }) as DriveFile

// The golden fixture (library-shared.golden.test.tsx), pre-move.
const PRE_MOVE: DriveFile[] = [
    f('c1', 'Adon Olam (Friedman)', 'core'),
    f('c2', 'Barchu (Sulzer)', 'core'),
    f('c3', 'Hashkivenu (Shireinu)', 'supplemental'),
    f('n1', 'Lecha Dodi (Nava)', 'nava'),
    f('n2', 'Yedid Nefesh (Nava)', 'nava'),
    f('n3', 'Hineh Mah Tov (Nava)', 'nava'),
    f('c4', 'Modah Ani', 'uploads'),
]

// After the move: the server's host-scoped list no longer has the nava rows;
// they are owned by Nava Tehila, keep collection "nava", and are visible to crc.
const moved = (src: DriveFile): SharedFile =>
    toSharedFile(src.id, {
        name: src.name,
        mimeType: src.mimeType,
        orgId: 'nava-tehila',
        visibleToOrgs: ['nava-tehila', 'crc'],
        collection: 'nava',
        collectionId: 'nava-tehila__nava',
        status: 'active',
    })!
const POST_MOVE_OWN = PRE_MOVE.filter((x) => x.collection !== 'nava')
const POST_MOVE_SHARED = PRE_MOVE.filter((x) => x.collection === 'nava').map(moved)
const NAVA_RECORD: SharedCollection = { id: 'nava-tehila__nava', ownerOrgId: 'nava-tehila', name: 'nava', label: 'Nava Tehila' }

function fakeSource(collections: SharedCollection[], rows: SharedFile[]) {
    const source = {
        listCollections: vi.fn(async (org: string) => collections.filter((c) => c.ownerOrgId !== org)),
        listSharedRows: vi.fn(async (org: string) => rows.filter((r) => r.orgId !== org && r.visibleToOrgs.includes(org))),
        ownerName: vi.fn(async (o: string) => (o === 'nava-tehila' ? 'Nava Tehila' : null)),
    } satisfies SharedSource
    setSharedSourceForTests(source)
    return source
}

function renderLibrary(org: OrgId, files: DriveFile[]) {
    return render(
        <OrgProvider orgId={org}>
            <SongChartsLibrary initialLibrary={files} org={org} />
        </OrgProvider>,
    )
}

const tabs = () =>
    Array.from(screen.getByRole('group', { name: 'Library section' }).querySelectorAll('button')).map((b) => b.textContent)
const rowTitles = () =>
    screen.getAllByTestId('row').map((r) => within(r).getAllByRole('button')[0].getAttribute('aria-label'))
const firstMenu = () =>
    within(screen.getAllByTestId('row-menu')[0]).getAllByRole('menuitem').map((m) => m.textContent?.trim())

describe('CRC "Nava Tehilah" tab before and after the nava move', () => {
    beforeEach(() => {
        localStorage.clear()
        useLibraryStore.getState().setSharedSectionFiles([])
        useLibraryStore.getState().hydrate([])
    })
    afterEach(() => {
        cleanup()
        setSharedSourceForTests(null)
    })

    async function navaTab(files: DriveFile[]) {
        renderLibrary('crc', files)
        const tab = await screen.findByRole('button', { name: 'Nava Tehilah (3)' })
        const allTabs = tabs()
        await userEvent.click(tab)
        return { allTabs, titles: rowTitles() }
    }

    it('count, tabs and titles are identical; only the edit actions change', async () => {
        fakeSource([], [])
        const before = await navaTab(PRE_MOVE)
        expect(firstMenu()).toEqual(['Select / View', 'Digitize (AI)', 'Rename', 'Archive Chart'])
        cleanup()
        useLibraryStore.getState().hydrate([])

        const src = fakeSource([NAVA_RECORD], POST_MOVE_SHARED)
        const after = await navaTab(POST_MOVE_OWN)
        expect(after).toEqual(before)
        expect(before.allTabs).toEqual(['CRC Charts (2)', 'Shireinu (1)', 'Nava Tehilah (3)', 'Uploads (1)'])
        expect(after.titles).toEqual(['View Hineh Mah Tov (Nava)', 'View Lecha Dodi (Nava)', 'View Yedid Nefesh (Nava)'])
        // The section loads by visibility with no chip; the nava record offers no chip to CRC.
        expect(src.listSharedRows).toHaveBeenCalledWith('crc')
        expect(screen.queryByTestId('library-shared-chip')).not.toBeInTheDocument()
        // Edit controls are gone on every moved row, with the reason.
        await waitFor(() =>
            expect(firstMenu()).toEqual([
                'Select / View',
                'Shared from Nava Tehila. You can use it but not change it.',
            ]),
        )
        for (const menu of screen.getAllByTestId('row-menu')) {
            expect(within(menu).queryByText('Rename')).toBeNull()
            expect(within(menu).queryByText(/Archive/)).toBeNull()
            expect(within(menu).queryByText(/Digitize/)).toBeNull()
        }
        // The tab keeps its look: no extra owner badge on CRC's own section.
        expect(screen.queryByTestId('shared-owner-badge')).toBeNull()
        // Other tabs are untouched.
        await userEvent.click(screen.getByRole('button', { name: 'CRC Charts (2)' }))
        expect(firstMenu()).toEqual(['Select / View', 'Digitize (AI)', 'Rename', 'Archive Chart'])
    })
})

describe('library page: shared collection chips', () => {
    beforeEach(() => {
        localStorage.clear()
        useLibraryStore.getState().setSharedSectionFiles([])
        useLibraryStore.getState().hydrate([])
    })
    afterEach(() => {
        cleanup()
        setSharedSourceForTests(null)
    })

    const BL_OWN = [f('b1', 'Pink Supermoon', 'core', 'brotherslazaroff')]
    const CRC_CORE: SharedCollection = { id: 'crc__core', ownerOrgId: 'crc', name: 'core', label: 'CRC Charts' }
    const shared = (id: string, name: string) =>
        toSharedFile(id, {
            name: `${name}.pdf`,
            mimeType: 'application/pdf',
            orgId: 'crc',
            collection: 'core',
            collectionId: 'crc__core',
            visibleToOrgs: ['crc', 'brotherslazaroff'],
        })!

    it('off by default; on adds a tab after the own ones with owner badges and no edit actions; remembered', async () => {
        const src = fakeSource([CRC_CORE], [shared('c1', 'Adon Olam (Friedman)'), shared('c2', 'Barchu (Sulzer)')])
        renderLibrary('brotherslazaroff', BL_OWN)
        const chip = await screen.findByTestId('library-shared-chip')
        expect(chip).toHaveAttribute('aria-pressed', 'false')
        expect(chip).toHaveTextContent('CRC ChartsFrom CRC Music')
        expect(tabs()).toEqual(['Charts (1)', 'Uploads (0)'])
        expect(src.listSharedRows).not.toHaveBeenCalled()

        await userEvent.click(chip)
        await waitFor(() => expect(tabs()).toEqual(['Charts (1)', 'Uploads (0)', 'CRC Charts (2)']))
        expect(screen.getByRole('button', { name: 'CRC Charts (2)' })).toHaveAttribute('aria-pressed', 'true')
        expect(rowTitles()).toEqual(['View Adon Olam (Friedman)', 'View Barchu (Sulzer)'])
        const badges = screen.getAllByTestId('shared-owner-badge')
        expect(badges.map((b) => b.textContent)).toEqual(['From CRC Music', 'From CRC Music'])
        expect(badges[0]).toHaveAttribute('title', 'Shared from CRC Music. You can use it but not change it.')
        expect(firstMenu()).toEqual(['Select / View', 'Shared from CRC Music. You can use it but not change it.'])
        cleanup()

        renderLibrary('brotherslazaroff', BL_OWN)
        expect(await screen.findByTestId('library-shared-chip')).toHaveAttribute('aria-pressed', 'true')
        await userEvent.click(screen.getByTestId('library-shared-chip'))
        await waitFor(() => expect(tabs()).toEqual(['Charts (1)', 'Uploads (0)']))
        expect(rowTitles()).toEqual(['View Pink Supermoon'])
    })
})
