import '@testing-library/jest-dom'
import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 7 pseudo-locale check for the library page: header, search, filters,
// section tabs, shared-collection chips, a real row (with its context menu),
// the selection bar and the "all sites" switch. Mocks follow
// library-shared.golden.test.tsx.

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
        canAddToSetlist: true,
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
vi.mock('@/hooks/use-shared-collections', () => ({
    useSharedCollections: () => ({
        chips: [{ id: 'col-x', ownerOrgId: 'other', name: 'Test Collection', label: 'Test Collection', owner: 'Other Org', on: false }],
        toggle: vi.fn(),
        chipRows: [],
        owner: () => 'Other Org',
        loading: false,
        failed: true,
    }),
}))
vi.mock('@/lib/cache-utils', () => ({ isFileCached: vi.fn().mockResolvedValue(true) }))
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

import { expectNoUntranslatedText, renderPseudo } from '@/test-utils/i18n'
import { useLibraryStore } from '@/lib/library-store'
import type { DriveFile } from '@/types/models'

import { SongChartsLibrary } from '../SongChartsLibrary'
import { LibraryFileRow } from '../LibraryFileRow'
import { LibraryFilters, createEmptyFilters } from '../LibraryFilters'
import { SelectionActionBar } from '../SelectionActionBar'

const FILES: DriveFile[] = [
    { id: 'a', name: 'Test Song A.pdf', mimeType: 'application/pdf', collection: 'core', orgId: 'crc', metadata: { key: 'C', topics: ['Topic One'], bpm: 90 } },
    { id: 'b', name: 'Test Song B.pdf', mimeType: 'application/pdf', collection: 'supplemental', orgId: 'crc', metadata: { key: 'G' } },
    { id: 'c', name: 'Test Track.mp3', mimeType: 'audio/mpeg', orgId: 'crc' },
] as DriveFile[]

// Data the page shows: chart/file titles, key names, topics, collection
// (book) names, the congregation's short name (logo alt), the shared
// collection's label and owner.
const DATA = ['Test Song A', 'Test Song B', 'C', 'G', 'Topic One', 'Shireinu', 'Nava Tehilah', 'CRC', 'Test Collection']

describe('library page i18n (pseudo-locale)', () => {
    beforeEach(() => useLibraryStore.getState().hydrate([]))

    it('qps: page chrome, filters and rows come through t()', async () => {
        const r = renderPseudo(<SongChartsLibrary initialLibrary={FILES} org="crc" />)
        await act(async () => {})
        // Expand the key and topic filter pickers.
        const chips = r.container.querySelectorAll('.scrollbar-hide button')
        fireEvent.click(chips[0])
        expectNoUntranslatedText(r.container, { allow: DATA })
        fireEvent.click(chips[1])
        expectNoUntranslatedText(r.container, { allow: DATA })
        // Turn on the admin "all sites" switch.
        fireEvent.click(screen.getByRole('switch'))
        expectNoUntranslatedText(r.container, { allow: DATA })
        expect(screen.getAllByTestId('row-menu').length).toBeGreaterThan(0)
        // Sanity: the pseudo-locale is really active.
        expect(r.container.querySelector('h1')?.textContent).toMatch(/^⟦.*⟧$/)
        expect(screen.getByRole('switch').textContent).toMatch(/⟦/)
    })

    it('qps-rtl: renders rtl with no untranslated text', async () => {
        const r = renderPseudo(<SongChartsLibrary initialLibrary={FILES} org="crc" />, { rtl: true })
        await act(async () => {})
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it('row: shared, audio, usage badge and every menu item come through t()', async () => {
        const noop = () => {}
        const r = renderPseudo(
            <div>
                <LibraryFileRow
                    item={FILES[0]}
                    onClick={noop}
                    isDigitizing={true}
                    isAdmin={true}
                    onDigitize={noop}
                    onArchive={noop}
                    onRename={noop}
                    getCleanName={(n) => n.replace(/\.pdf$/, '')}
                    usageInfo={{ lastUsedDate: '2026-01-31T12:00:00', totalUses: 4 }}
                    canAddToSetlist
                    onAddToSetlist={noop}
                />
                <LibraryFileRow
                    item={FILES[1]}
                    onClick={noop}
                    isDigitizing={false}
                    isAdmin={true}
                    getCleanName={(n) => n.replace(/\.pdf$/, '')}
                    sharedFrom={{ owner: 'Other Org', badge: true }}
                />
                <LibraryFileRow item={FILES[2]} onClick={noop} isDigitizing={false} isAdmin={false} getCleanName={(n) => n} isPlaying />
                <LibraryFileRow
                    item={{ id: 'f', name: 'Folder Name', mimeType: 'application/vnd.google-apps.folder' } as DriveFile}
                    onClick={noop}
                    isDigitizing={false}
                    isAdmin={false}
                    getCleanName={(n) => n}
                />
            </div>,
        )
        await act(async () => {})
        expectNoUntranslatedText(r.container, { allow: [...DATA, 'Test Track', 'Folder Name'] })
    })

    it('filters: recency picker and selection bar come through t()', () => {
        const r = renderPseudo(
            <div>
                <LibraryFilters allFiles={FILES} filters={createEmptyFilters()} onFiltersChange={() => {}} usageMap={{}} />
                <SelectionActionBar
                    selectMode
                    selectedIds={new Set(['a', 'b'])}
                    combinedItems={FILES}
                    getCleanName={(n) => n}
                    onSelectAll={() => {}}
                    onClear={() => {}}
                    onDismiss={() => {}}
                    onAddToSetlist={() => {}}
                />
            </div>,
        )
        const chips = r.container.querySelectorAll('.scrollbar-hide button')
        fireEvent.click(chips[2])
        expectNoUntranslatedText(r.container, { allow: DATA })
    })
})
