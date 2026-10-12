import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Multi-tenant phase 5 golden (committed BEFORE the shared collections change,
// passing on the unchanged library page): with no sharing configured, CRC and
// BL see these tabs, counts, rows and row actions.

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
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ isAdmin: true, isBandLeader: true, profile: {}, canUpload: false, user: null }),
}))
vi.mock('@/lib/congregation-store', () => ({ useCongregation: () => ({ shortName: 'CRC' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })) }))
vi.mock('@/hooks/use-library', () => ({
    useLibrary: () => ({ refetch: vi.fn(), isLoading: false, error: null }),
}))
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

import { useLibraryStore } from '@/lib/library-store'
import { OrgProvider } from '@/lib/org/org-context'
import type { OrgId } from '@/lib/org/types'
import type { DriveFile } from '@/types/models'

import { SongChartsLibrary } from '../SongChartsLibrary'

const f = (id: string, name: string, collection: DriveFile['collection'], orgId = 'crc'): DriveFile =>
    ({ id, name: `${name}.pdf`, mimeType: 'application/pdf', collection, orgId }) as DriveFile

export const CRC_LIBRARY: DriveFile[] = [
    f('c1', 'Adon Olam (Friedman)', 'core'),
    f('c2', 'Barchu (Sulzer)', 'core'),
    f('c3', 'Hashkivenu (Shireinu)', 'supplemental'),
    f('n1', 'Lecha Dodi (Nava)', 'nava'),
    f('n2', 'Yedid Nefesh (Nava)', 'nava'),
    f('n3', 'Hineh Mah Tov (Nava)', 'nava'),
    f('c4', 'Modah Ani', 'uploads'),
]
const BL_LIBRARY: DriveFile[] = [
    f('b1', 'Pink Supermoon', 'core', 'brotherslazaroff'),
    f('b2', 'We Still Stand', 'uploads', 'brotherslazaroff'),
]

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

describe('phase 5 golden: library page with no sharing configured', () => {
    beforeEach(() => useLibraryStore.getState().hydrate([]))

    it('CRC: four tabs with counts; Nava Tehilah tab lists the nava rows with admin actions', async () => {
        renderLibrary('crc', CRC_LIBRARY)
        expect(tabs()).toEqual(['CRC Charts (2)', 'Shireinu (1)', 'Nava Tehilah (3)', 'Uploads (1)'])
        expect(rowTitles()).toEqual(['View Adon Olam (Friedman)', 'View Barchu (Sulzer)'])
        await userEvent.click(screen.getByRole('button', { name: 'Nava Tehilah (3)' }))
        expect(rowTitles()).toEqual(['View Hineh Mah Tov (Nava)', 'View Lecha Dodi (Nava)', 'View Yedid Nefesh (Nava)'])
        const menu = within(screen.getAllByTestId('row-menu')[0])
        expect(menu.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual([
            'Select / View',
            'Digitize (AI)',
            'Rename',
            'Archive Chart',
        ])
        expect(screen.queryByTestId('library-shared-chip')).not.toBeInTheDocument()
    })

    it('BL: two tabs, own rows only', () => {
        renderLibrary('brotherslazaroff', BL_LIBRARY)
        expect(tabs()).toEqual(['Charts (1)', 'Uploads (1)'])
        expect(rowTitles()).toEqual(['View Pink Supermoon'])
        expect(screen.queryByTestId('library-shared-chip')).not.toBeInTheDocument()
    })
})
