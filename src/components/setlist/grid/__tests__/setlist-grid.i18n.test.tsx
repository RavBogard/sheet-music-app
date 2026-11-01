import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 7 — pseudo-locale checks for the setlist editor grid: every string on
// screen must come through t() (⟦…⟧ under qps), and on qps-rtl the page is rtl
// while the chart thumbnail / page-1 preview (chart content) stays ltr.

// jsdom shims (parity with the grid's other tests): Radix Popover / Select /
// ContextMenu + cmdk touch ResizeObserver, scrollIntoView and pointer capture.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined') {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function () {}
    if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
    if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {}
    if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {}
}

const { mockSubscribe, chartLoad } = vi.hoisted(() => ({
    mockSubscribe: vi.fn(),
    chartLoad: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: null, isAdmin: true, isBandLeader: true, signOut: vi.fn() }),
}))
vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: vi.fn(),
    seedTrackFromSong: vi.fn(async () => ({})),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))
vi.mock('@/lib/recordings/recordings-client', () => ({
    subscribeRecordingsForSong: mockSubscribe,
    uploadRecording: vi.fn(),
    getRecordingPlaybackUrl: (rec: { id: string }) => `/api/recordings/file/${rec.id}`,
}))
vi.mock('@/lib/charts/chart-page1', async (orig) => {
    const actual = await orig<typeof import('@/lib/charts/chart-page1')>()
    return { ...actual, chartPage1Loader: () => ({ load: chartLoad, stats: () => ({}) }) }
})
vi.mock('@/lib/sync/cleanup', () => ({
    discardFailedOutboxRows: vi.fn(async () => ({ removed: 0 })),
    retryFailedOutboxRows: vi.fn(async () => ({ retried: 0 })),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { expectNoUntranslatedText, renderPseudo } from '@/test-utils/i18n'
import { useLibraryStore } from '@/lib/library-store'
import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { useSyncStatus } from '@/lib/sync/store'
import type { DriveFile } from '@/types/models'

import { AddBar } from '../AddBar'
import { ChartBindDialog } from '../ChartBindDialog'
import { DeleteConfirmProvider } from '../DeleteConfirmProvider'
import { RecordingBindPopover } from '../RecordingBindPopover'
import { SetlistGrid } from '../SetlistGrid'
import { SetlistMetaEditSheet } from '../SetlistMetaEditSheet'
import { SyncIndicator } from '../SyncIndicator'
import { KeyCell } from '../cells/KeyCell'
import { LeadCell } from '../cells/LeadCell'
import { RecordingCell } from '../cells/RecordingCell'
import { TypeCell } from '../cells/TypeCell'

const SETLIST_ID = 'i18n-set'
const SETLIST_NAME = 'Test Setlist One'
const TRACKS: Partial<LocalTrack>[] = [
    { id: 'row-a', order: 0, title: 'Test Song A', key: 'G', leadMusician: 'Singer One', songId: 'song-a', fileId: 'song-a' },
    { id: 'row-b', order: 1, title: 'Test Song B', key: 'Dm' },
    { id: 'row-c', order: 2, title: '', type: 'reading' },
]
const SONGS = [
    { id: 'song-a', title: 'Test Song A' },
    { id: 'song-b', title: 'Test Song B (Composer X)' },
]
// Data shown by the components (titles, names, keys, the setlist name).
const ALLOW: Array<string | RegExp> = [
    SETLIST_NAME,
    'Test Song A',
    'Test Song B',
    'Composer X',
    'Singer One',
    'G',
    'Dm',
    'Take One',
]
// Collection chips show the tenant's configured collection labels (data).
const IGNORE = '[data-collection]'

async function seedGrid(tracks: Partial<LocalTrack>[] = TRACKS) {
    const db = getDb()
    await db.setlists.put({ id: SETLIST_ID, name: SETLIST_NAME, eventDate: Date.UTC(2026, 9, 16, 18) } as never)
    await db.tracks.bulkPut(
        tracks.map((t, i) => ({ id: `t-${i}`, setlistId: SETLIST_ID, order: i, ...t }) as LocalTrack),
    )
    await db.songs.bulkPut(SONGS.map((s) => ({ ...s, normalizedTitle: s.title.toLowerCase() })))
    useLibraryStore.getState().hydrate(
        SONGS.map((s) => ({ id: s.id, name: s.title, mimeType: 'application/pdf', collection: 'core' }) as DriveFile),
    )
}

function grid() {
    return (
        <DeleteConfirmProvider>
            <SetlistGrid setlistId={SETLIST_ID} name={SETLIST_NAME} />
        </DeleteConfirmProvider>
    )
}

describe('setlist grid i18n (pseudo-locale)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockSubscribe.mockReset()
        chartLoad.mockReset()
        chartLoad.mockImplementation(() => Promise.resolve({ kind: 'image', url: 'blob:page1' }))
        useSyncStatus.setState({ state: 'idle', queued: 0, lastError: undefined, lastSyncAt: undefined })
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('qps: grid with rows, top bar, sync indicator and add bar come through t()', async () => {
        await seedGrid()
        const r = renderPseudo(grid())
        await screen.findByText('Test Song B')
        await waitFor(() => expect(screen.getByTestId('setlist-grid-top-bar').textContent).toMatch(/⟦/))
        expectNoUntranslatedText(r.container, { allow: ALLOW, ignoreSelector: IGNORE })
        // The untitled reading row, the Key / Vocal Lead badges and the add bar are pseudo.
        expect(screen.getByTestId('mobile-card-edit-row-c').getAttribute('aria-label')).toMatch(/^⟦/)
        expect(screen.getByTestId('add-row-trigger').textContent).toMatch(/⟦/)
    })

    it('qps: row context menu, delete confirm and inline editor', async () => {
        await seedGrid()
        const r = renderPseudo(grid())
        await screen.findByText('Test Song B')

        fireEvent.contextMenu(screen.getByTestId('mobile-card-row-a'))
        await screen.findByTestId('mobile-card-context-menu-delete')
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })

        fireEvent.click(screen.getByTestId('mobile-card-context-menu-delete'))
        await screen.findByTestId('delete-confirm-dialog')
        expect(screen.getByTestId('delete-confirm-title').textContent).toMatch(/⟦/)
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
        fireEvent.click(screen.getByTestId('delete-confirm-cancel'))
        await waitFor(() => expect(screen.queryByTestId('delete-confirm-dialog')).toBeNull())

        // Inline editor (card tap).
        fireEvent.click(screen.getByTestId('mobile-card-row-a'))
        await waitFor(() => expect(r.container.querySelector('aside')).not.toBeNull())
        // The key dropdown's options are key names (data); its "— None —" option is UI.
        expectNoUntranslatedText(r.container, { allow: ALLOW, ignoreSelector: `${IGNORE}, option:not([value=""])` })
    })

    it('qps: empty state', async () => {
        const r = renderPseudo(grid())
        await screen.findByTestId('setlist-grid-empty-state')
        expectNoUntranslatedText(r.container, { allow: ALLOW, ignoreSelector: IGNORE })
    })

    it('qps: add bar tile popover and the "+ Song" picker with a custom row', async () => {
        await seedGrid([])
        renderPseudo(<AddBar onPickSong={vi.fn()} onCreateFreeText={vi.fn()} onAddTrackOfType={vi.fn()} />)
        await userEvent.click(screen.getByTestId('add-bar-chevron-trigger'))
        await screen.findByTestId('add-bar-tiles-popover')
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
        await userEvent.keyboard('{Escape}')

        await userEvent.click(screen.getByTestId('add-row-trigger'))
        const input = await screen.findByRole('combobox')
        await userEvent.type(input, 'Zz')
        await waitFor(() => expect(document.body.textContent).toMatch(/Zz/))
        expectNoUntranslatedText(document.body, { allow: [...ALLOW, /Zz/], ignoreSelector: IGNORE })
    })

    it('qps: chart bind dialog (ChartPickerList), page-1 preview', async () => {
        await seedGrid([])
        renderPseudo(<ChartBindDialog open onOpenChange={vi.fn()} onBind={vi.fn()} />)
        await screen.findByText('Test Song A')
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
        // Admin "include other sites" toggle is pseudo.
        expect(screen.getByTestId('picker-other-sites').textContent).toMatch(/⟦/)

        const thumb = document.querySelector('[data-chart-thumb="song-a"]') as HTMLElement
        fireEvent.click(thumb)
        await screen.findByTestId('chart-page1-dialog')
        await waitFor(() => expect(document.querySelector('[data-chart-page1-image]')).not.toBeNull())
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
    })

    it('qps: recording bind popover (list + empty) and recording cell', async () => {
        mockSubscribe.mockImplementation((_songId: string, _org: string, cb: (recs: unknown[]) => void) => {
            cb([{ id: 'rec-1', songId: 'song-a', title: 'Take One', storagePath: 'x', createdAt: '', createdBy: 'u' }])
            return () => {}
        })
        renderPseudo(
            <RecordingBindPopover songId="song-a" songTitle="Test Song A">
                <RecordingCell disabled={false} />
            </RecordingBindPopover>,
        )
        await userEvent.click(screen.getByTestId('recording-cell'))
        await screen.findByTestId('recording-bind-popover')
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
    })

    it('qps: setlist details sheet', async () => {
        renderPseudo(
            <SetlistMetaEditSheet
                setlistId={SETLIST_ID}
                open
                onOpenChange={vi.fn()}
                initial={{ name: SETLIST_NAME, eventDate: Date.UTC(2026, 9, 16, 18), templateType: 'shabbat_morning' }}
                applyEdit={vi.fn()}
            />,
        )
        await screen.findByDisplayValue(SETLIST_NAME)
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: IGNORE })
    })

    it('qps: sync indicator states', async () => {
        const r = renderPseudo(<SyncIndicator />)
        for (const s of [
            { state: 'idle', queued: 0, lastSyncAt: Date.now() },
            { state: 'saving', queued: 0 },
            { state: 'offline', queued: 3 },
            { state: 'conflict', queued: 0 },
            { state: 'failed', queued: 0, lastError: 'permission-denied' },
        ] as const) {
            act(() => useSyncStatus.setState({ lastError: undefined, lastSyncAt: undefined, ...s }))
            // The inline error detail is the engine's raw error (data).
            expectNoUntranslatedText(r.container, { allow: ['permission-denied'], ignoreSelector: '[data-testid="sync-indicator-error-detail"]' })
        }
        expect(screen.getByTestId('sync-indicator-signout-link').textContent).toMatch(/⟦/)
    })

    it('qps: cells (type, key with its picker, lead)', async () => {
        const noop = () => {}
        const r = renderPseudo(
            <div>
                <TypeCell value="reading" onCommit={noop} isFocused={false} onFocus={noop} />
                <TypeCell value={undefined} onCommit={noop} isFocused={false} onFocus={noop} />
                <KeyCell value={undefined} onCommit={noop} isFocused={false} onFocus={noop} />
                <LeadCell value={undefined} onCommit={noop} isFocused={false} onFocus={noop} setlistLeads={['Singer One']} />
            </div>,
        )
        expectNoUntranslatedText(r.container, { allow: ALLOW })
        await userEvent.click(screen.getAllByTestId('dropdown-cell-button')[2])
        await screen.findByTestId('key-picker-tabs')
        // Key names (C, C♯/D♭, …) are data.
        expectNoUntranslatedText(document.body, { allow: ALLOW, ignoreSelector: '[cmdk-item]' })
    })

    it('qps-rtl: the grid is rtl; chart thumbnails and the page-1 preview stay ltr', async () => {
        await seedGrid()
        const r = renderPseudo(grid(), { rtl: true })
        await screen.findByText('Test Song B')
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expectNoUntranslatedText(r.container, { allow: ALLOW, ignoreSelector: IGNORE })

        // Open the chart bind dialog from the row's context menu.
        fireEvent.contextMenu(screen.getByTestId('mobile-card-row-b'))
        fireEvent.click(await screen.findByTestId('mobile-card-context-menu-bind-chart'))
        await screen.findByTestId('chart-bind-dialog')
        await screen.findByText('Test Song A')
        // The picker's rows (and their thumbnails) load after the dialog opens; "Test Song A"
        // can match the grid row first, so wait for the thumbnail itself.
        await waitFor(() => expect(document.querySelector('[data-chart-thumb="song-a"]')).not.toBeNull(), { timeout: 5000 })
        const thumb = document.querySelector('[data-chart-thumb="song-a"]') as HTMLElement
        expect(thumb.getAttribute('dir')).toBe('ltr')

        fireEvent.click(thumb)
        await screen.findByTestId('chart-page1-dialog')
        await waitFor(() => expect(document.querySelector('[data-chart-page1-image]')).not.toBeNull())
        expect(document.querySelector('[data-chart-page1-image]')!.getAttribute('dir')).toBe('ltr')
    })

    it('ltr (English) DOM is unchanged: no dir attribute on chart thumbnails', async () => {
        await seedGrid([])
        renderPseudo(<ChartBindDialog open onOpenChange={vi.fn()} onBind={vi.fn()} />)
        await screen.findByText('Test Song A')
        const thumb = document.querySelector('[data-chart-thumb="song-a"]') as HTMLElement
        expect(thumb.hasAttribute('dir')).toBe(false)
    })
})
