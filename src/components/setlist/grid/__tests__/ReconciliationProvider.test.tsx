import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest'

expect.extend(toHaveNoViolations)

// jsdom shims required by Radix AlertDialog content + the v50-05-05 a11y
// harness pattern. Mirrors SetlistGrid.a11y.test.tsx.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
const g = globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }
g.ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}

// Mock useSyncStatus so we can drive the engine-state input. The provider
// reads only `state` (selector form) — return a function-shaped mock that
// honors the selector contract.
let mockState: 'idle' | 'conflict' = 'idle'
vi.mock('@/lib/sync/store', () => ({
    useSyncStatus: <T,>(selector: (s: { state: typeof mockState }) => T): T =>
        selector({ state: mockState }),
}))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { OutboxRow } from '@/lib/local/types'
import type { FirestoreAdapter } from '@/lib/sync/firestore-adapter'

import {
    ReconciliationProvider,
    classifyOutboxError,
} from '../ReconciliationProvider'

// Reuse the v50-05-05 axeOpts — same harness-context disabled rules.
const axeOpts = {
    rules: {
        region: { enabled: false },
        'landmark-one-main': { enabled: false },
        'page-has-heading-one': { enabled: false },
        'aria-required-children': { enabled: false },
        'aria-required-parent': { enabled: false },
    },
}

function setMockState(s: 'idle' | 'conflict'): void {
    mockState = s
}

async function seedFailedRows(rows: Partial<OutboxRow>[]): Promise<void> {
    const db = getDb()
    const now = Date.now()
    for (const r of rows) {
        await db.outbox.add({
            status: r.status ?? 'failed',
            scheduledFor: r.scheduledFor ?? now,
            op: r.op ?? 'update',
            collection: r.collection ?? 'tracks',
            docId: r.docId ?? 'unset',
            payload: r.payload ?? {},
            expectedUpdatedAt: r.expectedUpdatedAt,
            attempts: r.attempts ?? 1,
            lastError: r.lastError ?? 'expected updatedAt=1000, remote=2000',
            createdAt: r.createdAt ?? now,
        } as OutboxRow)
    }
}

async function seedTrack(
    docId: string,
    fields: Record<string, unknown>,
): Promise<void> {
    const db = getDb()
    await db.tracks.put({
        id: docId,
        setlistId: fields.setlistId ?? 's1',
        order: typeof fields.order === 'number' ? fields.order : 0,
        ...fields,
    } as never)
}

interface FakeAdapter extends FirestoreAdapter {
    readDocCalls: Array<[string, string]>
}

function makeAdapter(
    remoteByDocId: Record<string, { data: Record<string, unknown>; updatedAt: number } | null>,
): FakeAdapter {
    const calls: Array<[string, string]> = []
    return {
        readDocCalls: calls,
        async commitOutboxRow() {
            return {}
        },
        async refreshAuthToken() {},
        async readDoc(collection, docId) {
            calls.push([collection, docId])
            return remoteByDocId[docId] ?? null
        },
    }
}

describe('ReconciliationProvider', () => {
    beforeEach(async () => {
        await resetDbForTests()
        setMockState('idle')
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('does not render dialog when state is idle (provider mounted, no conflict)', async () => {
        render(
            <ReconciliationProvider adapter={null}>
                <span data-testid="child">child</span>
            </ReconciliationProvider>,
        )
        expect(screen.getByTestId('child')).toBeInTheDocument()
        expect(
            screen.queryByTestId('reconciliation-dialog'),
        ).not.toBeInTheDocument()
    })

    it('AC-1: opens automatically when state=conflict and at least one failed row exists', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', title: 'Aleinu', key: 'G' }, updatedAt: 2000 },
        })

        setMockState('conflict')

        render(
            <ReconciliationProvider adapter={adapter}>
                <span>child</span>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')
        expect(screen.getByTestId('reconciliation-title')).toHaveTextContent(
            'Remote changes detected',
        )
    })

    it('AC-2: renders one card per failed row with per-field "Your" / "Their" diff', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F', leadMusician: 'Rabbi' })
        await seedTrack('t2', { title: 'Lecha Dodi', bpm: 90 })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A', leadMusician: 'Randy' },
                expectedUpdatedAt: 1000,
            },
            {
                docId: 't2',
                payload: { bpm: 100 },
                expectedUpdatedAt: 1500,
            },
        ])
        const adapter = makeAdapter({
            t1: {
                data: { id: 't1', key: 'G', leadMusician: 'Cantor' },
                updatedAt: 2000,
            },
            t2: {
                data: { id: 't2', bpm: 80 },
                updatedAt: 2500,
            },
        })

        setMockState('conflict')

        render(
            <ReconciliationProvider adapter={adapter}>
                <span>child</span>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')

        // Wait for remote-doc fetches to resolve and diff cards render.
        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(2)
        })

        // Two cards rendered with their titles.
        await screen.findByText('Aleinu')
        await screen.findByText('Lecha Dodi')

        // Per-field diff lines visible. Two cards rendered.
        const cards = await screen.findAllByTestId(/^reconciliation-card-/)
        expect(cards).toHaveLength(2)

        // Confirm "Your version" + "Their version" labels render at least
        // once per card (we have 3 changed fields total: t1.key, t1.lead, t2.bpm).
        const yourLabels = await screen.findAllByText(/Your version/)
        const theirLabels = await screen.findAllByText(/Their version/)
        expect(yourLabels.length).toBe(3)
        expect(theirLabels.length).toBe(3)
    })

    it('AC-3 (mine path): "Resolve all and save" calls onResolveConflict with chosen value + newExpectedUpdatedAt', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })
        const onResolveConflict = vi.fn(async () => undefined)

        setMockState('conflict')

        render(
            <ReconciliationProvider
                adapter={adapter}
                onResolveConflict={onResolveConflict}
            >
                <span>child</span>
            </ReconciliationProvider>,
        )

        // Wait for snapshots so the resolve button is enabled.
        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(1)
        })

        const failedRows = await getDb().outbox.toArray()
        const localId = failedRows[0].localId!

        // Pick "Keep mine" then click Resolve all.
        fireEvent.click(
            screen.getByTestId(`reconciliation-radio-${localId}-mine`),
        )
        fireEvent.click(screen.getByTestId('reconciliation-resolve'))

        await waitFor(() => {
            expect(onResolveConflict).toHaveBeenCalledTimes(1)
        })
        expect(onResolveConflict).toHaveBeenCalledWith(localId, 'mine', {
            newExpectedUpdatedAt: 2000,
        })
    })

    it('AC-3 (theirs default): defaults to theirs + omits newExpectedUpdatedAt', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })
        const onResolveConflict = vi.fn(async () => undefined)

        setMockState('conflict')

        render(
            <ReconciliationProvider
                adapter={adapter}
                onResolveConflict={onResolveConflict}
            >
                <span>child</span>
            </ReconciliationProvider>,
        )

        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(1)
        })
        const failedRows = await getDb().outbox.toArray()
        const localId = failedRows[0].localId!

        // Don't change radio — default is 'theirs'. Click Resolve all.
        fireEvent.click(screen.getByTestId('reconciliation-resolve'))

        await waitFor(() => {
            expect(onResolveConflict).toHaveBeenCalledTimes(1)
        })
        expect(onResolveConflict).toHaveBeenCalledWith(localId, 'theirs', {
            newExpectedUpdatedAt: undefined,
        })
    })

    it('AC-4: Cancel closes modal without calling onResolveConflict', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })
        const onResolveConflict = vi.fn(async () => undefined)

        setMockState('conflict')

        render(
            <ReconciliationProvider
                adapter={adapter}
                onResolveConflict={onResolveConflict}
            >
                <span>child</span>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')
        fireEvent.click(screen.getByTestId('reconciliation-cancel'))

        await waitFor(() => {
            expect(
                screen.queryByTestId('reconciliation-dialog'),
            ).not.toBeInTheDocument()
        })
        expect(onResolveConflict).not.toHaveBeenCalled()
    })

    it('AC-4 (Esc): pressing Escape on dialog closes it without resolving', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })
        const onResolveConflict = vi.fn(async () => undefined)

        setMockState('conflict')

        render(
            <ReconciliationProvider
                adapter={adapter}
                onResolveConflict={onResolveConflict}
            >
                <span>child</span>
            </ReconciliationProvider>,
        )

        const dialog = await screen.findByTestId('reconciliation-dialog')
        fireEvent.keyDown(dialog, { key: 'Escape' })

        await waitFor(() => {
            expect(
                screen.queryByTestId('reconciliation-dialog'),
            ).not.toBeInTheDocument()
        })
        expect(onResolveConflict).not.toHaveBeenCalled()
    })

    it("'Resolve all and save' iterates all rows in failed-row order", async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedTrack('t2', { title: 'Lecha Dodi', bpm: 90 })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
            {
                docId: 't2',
                payload: { bpm: 100 },
                expectedUpdatedAt: 1500,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
            t2: { data: { id: 't2', bpm: 80 }, updatedAt: 2500 },
        })
        const onResolveConflict = vi.fn(async () => undefined)

        setMockState('conflict')

        render(
            <ReconciliationProvider
                adapter={adapter}
                onResolveConflict={onResolveConflict}
            >
                <span>child</span>
            </ReconciliationProvider>,
        )

        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(2)
        })

        const failedRows = await getDb().outbox.toArray()
        // Pick mine for first row, leave theirs for second.
        fireEvent.click(
            screen.getByTestId(
                `reconciliation-radio-${failedRows[0].localId}-mine`,
            ),
        )
        fireEvent.click(screen.getByTestId('reconciliation-resolve'))

        await waitFor(() => {
            expect(onResolveConflict).toHaveBeenCalledTimes(2)
        })

        const calls = (onResolveConflict as Mock).mock.calls
        expect(calls[0][0]).toBe(failedRows[0].localId)
        expect(calls[0][1]).toBe('mine')
        expect(calls[0][2]).toEqual({ newExpectedUpdatedAt: 2000 })

        expect(calls[1][0]).toBe(failedRows[1].localId)
        expect(calls[1][1]).toBe('theirs')
        expect(calls[1][2]).toEqual({ newExpectedUpdatedAt: undefined })
    })
})

describe('T1.4: classifyOutboxError', () => {
    it('VersionMismatchError message → version-mismatch', () => {
        expect(
            classifyOutboxError('expected updatedAt=1000, remote=2000'),
        ).toBe('version-mismatch')
    })

    it("RemoteDocMissingError message → remote-missing", () => {
        expect(
            classifyOutboxError(
                "This setlist isn't on the server (was deleted or never synced). Refresh your library.",
            ),
        ).toBe('remote-missing')
    })

    it('AuthError message → auth', () => {
        expect(
            classifyOutboxError('Auth failure on tracks/abc: permission-denied'),
        ).toBe('auth')
        expect(
            classifyOutboxError('No authenticated user — cannot refresh token'),
        ).toBe('auth')
    })

    it('Unknown error → transient (dead-letter)', () => {
        expect(classifyOutboxError('some random failure')).toBe('transient')
    })

    it('Undefined lastError → transient', () => {
        expect(classifyOutboxError(undefined)).toBe('transient')
    })
})

describe('T1.4: modal title adapts to error kinds', () => {
    beforeEach(async () => {
        await resetDbForTests()
        setMockState('idle')
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('all VersionMismatch → "Remote changes detected" (legacy title)', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
                lastError: 'expected updatedAt=1000, remote=2000',
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })

        setMockState('conflict')

        render(
            <ReconciliationProvider adapter={adapter}>
                <span>child</span>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')
        expect(screen.getByTestId('reconciliation-title')).toHaveTextContent(
            'Remote changes detected',
        )
    })

    it('non-conflict-only failure (auth, etc.) does NOT open the modal', async () => {
        // P0 modal-flood fix (2026-05-12): the reconciliation modal is for
        // version-mismatch conflicts only. Auth / RemoteDocMissing /
        // dead-letter transient failures surface via SyncIndicator's
        // "Failed — retry" affordance instead — the modal's "Keep mine /
        // Take theirs" radios can't actually resolve those failure modes.
        await seedTrack('t1', { title: 'Aleinu' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                lastError: 'Auth failure on tracks/t1: permission-denied',
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })

        setMockState('failed')

        render(
            <ReconciliationProvider adapter={adapter}>
                <span>child</span>
            </ReconciliationProvider>,
        )

        // Wait a tick for any conditional render. The dialog should NOT mount.
        await new Promise((r) => setTimeout(r, 30))
        expect(screen.queryByTestId('reconciliation-dialog')).toBeNull()
    })
})

describe('ReconciliationProvider — WCAG AA (jest-axe)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        setMockState('idle')
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('AC-6: closed state has no axe violations', async () => {
        const { container } = render(
            <ReconciliationProvider adapter={null}>
                <main>
                    <h1>Editor</h1>
                </main>
            </ReconciliationProvider>,
        )
        const results = await axe(container, axeOpts)
        expect(results).toHaveNoViolations()
    })

    it('AC-6: open with one conflict has no axe violations', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedFailedRows([
            {
                docId: 't1',
                payload: { key: 'A' },
                expectedUpdatedAt: 1000,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
        })

        setMockState('conflict')

        const { container } = render(
            <ReconciliationProvider adapter={adapter}>
                <main>
                    <h1>Editor</h1>
                </main>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')
        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(1)
        })

        const results = await axe(container, axeOpts)
        expect(results).toHaveNoViolations()
    })

    it('AC-6: open with three conflicts has no axe violations', async () => {
        await seedTrack('t1', { title: 'Aleinu', key: 'F' })
        await seedTrack('t2', { title: 'Lecha Dodi', bpm: 90 })
        await seedTrack('t3', { title: 'Yigdal', leadMusician: 'Rabbi' })
        await seedFailedRows([
            { docId: 't1', payload: { key: 'A' }, expectedUpdatedAt: 1000 },
            { docId: 't2', payload: { bpm: 100 }, expectedUpdatedAt: 1500 },
            {
                docId: 't3',
                payload: { leadMusician: 'Randy' },
                expectedUpdatedAt: 1800,
            },
        ])
        const adapter = makeAdapter({
            t1: { data: { id: 't1', key: 'G' }, updatedAt: 2000 },
            t2: { data: { id: 't2', bpm: 80 }, updatedAt: 2500 },
            t3: {
                data: { id: 't3', leadMusician: 'Cantor' },
                updatedAt: 2800,
            },
        })

        setMockState('conflict')

        const { container } = render(
            <ReconciliationProvider adapter={adapter}>
                <main>
                    <h1>Editor</h1>
                </main>
            </ReconciliationProvider>,
        )

        await screen.findByTestId('reconciliation-dialog')
        await waitFor(() => {
            expect(adapter.readDocCalls).toHaveLength(3)
        })

        const results = await axe(container, axeOpts)
        expect(results).toHaveNoViolations()
    })
})
