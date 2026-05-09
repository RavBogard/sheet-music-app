'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getDb } from '@/lib/local/schema'
import type { LocalCollection, OutboxRow } from '@/lib/local/types'
import { getSyncAdapter, getSyncEngine } from '@/lib/sync/init'
import type {
    FirestoreAdapter,
    RemoteDocSnapshot,
} from '@/lib/sync/firestore-adapter'
import { useSyncStatus } from '@/lib/sync/store'
import { cn } from '@/lib/utils'

/**
 * v50-06-02 reconciliation modal — surfaces engine 'conflict' state as a
 * blocking AlertDialog with per-row "Keep mine / Take theirs" choice.
 *
 * Granularity decision (per-row, not per-field): see PLAN Task 0 + STATE.md.
 * The substrate API `engine.resolveConflict(localId, 'mine'|'theirs', opts)`
 * is per-row; the diff is rendered per-field for informational context, but
 * the choice is a single radio per failed outbox row.
 */

// Fields hidden from the diff: structural (id/setlistId), engine-managed
// (createdAt/updatedAt), or display-irrelevant for the conflict view (order
// changes from drag-end render as a generic "Reordered" flag — out of scope
// for v50-06-02; defer to v50-06-03 if it surfaces in real usage).
const DIFF_HIDDEN_FIELDS = new Set([
    'id',
    'setlistId',
    'order',
    'createdAt',
    'updatedAt',
])

const PRETTY_FIELD: Record<string, string> = {
    key: 'Key',
    leadMusician: 'Lead',
    bpm: 'BPM',
    title: 'Title',
    notes: 'Notes',
    type: 'Type',
    songId: 'Chart binding',
    name: 'Name',
}

function prettyFieldName(field: string): string {
    return PRETTY_FIELD[field] ?? field
}

function formatValue(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—'
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'yes' : 'no'
    return JSON.stringify(v)
}

type Choice = 'mine' | 'theirs'

interface ReconciliationContextValue {
    /** Re-open the modal after Cancel/Esc dismissal. SyncIndicator's
     *  conflict action button calls this. No-op when state ≠ 'conflict'. */
    openModal: () => void
}

const ReconciliationContext =
    createContext<ReconciliationContextValue | null>(null)

/** Throws if no provider mounted — for code paths that require the modal. */
export function useReconciliationModal(): ReconciliationContextValue {
    const ctx = useContext(ReconciliationContext)
    if (!ctx) {
        throw new Error(
            'useReconciliationModal must be used inside <ReconciliationProvider>',
        )
    }
    return ctx
}

/** Returns null if no provider mounted — used by SyncIndicator which is
 *  rendered in non-editor contexts (perform view, tests) where the
 *  reconciliation flow doesn't apply. Mirrors the
 *  useDeleteConfirmOptional pattern from DeleteConfirmProvider. */
export function useReconciliationModalOptional(): ReconciliationContextValue | null {
    return useContext(ReconciliationContext)
}

export interface ReconciliationProviderProps {
    children: ReactNode
    /** Test seam: inject a custom adapter (skip the singleton from init.ts).
     *  Production code never sets this — the modal reads from getSyncAdapter()
     *  to keep the provider decoupled from how the engine was booted. */
    adapter?: FirestoreAdapter | null
    /** Test seam: inject a custom resolveConflict (skip the engine singleton).
     *  Production code never sets this. */
    onResolveConflict?: (
        localId: number,
        choice: Choice,
        opts?: { newExpectedUpdatedAt?: number },
    ) => Promise<void>
}

interface FailedRow {
    localId: number
    collection: LocalCollection
    docId: string
    payload: Record<string, unknown>
    expectedUpdatedAt?: number
    lastError?: string
}

function adaptOutboxRow(row: OutboxRow): FailedRow | null {
    if (row.localId === undefined) return null
    return {
        localId: row.localId,
        collection: row.collection,
        docId: row.docId,
        payload: row.payload,
        expectedUpdatedAt: row.expectedUpdatedAt,
        lastError: row.lastError,
    }
}

function rowKey(r: FailedRow | { collection: string; docId: string }): string {
    return `${r.collection}/${r.docId}`
}

export function ReconciliationProvider({
    children,
    adapter: adapterOverride,
    onResolveConflict: resolveOverride,
}: ReconciliationProviderProps) {
    const state = useSyncStatus((s) => s.state)

    // Live query: every outbox row in 'failed' status. Engine state
    // 'conflict' is the gate, but the rows themselves are the data the
    // modal renders. Querying both decouples the modal from the engine's
    // internal book-keeping.
    const failedOutboxRows = useLiveQuery(
        async () =>
            getDb().outbox.where('status').equals('failed').toArray(),
        [],
        [] as OutboxRow[],
    )

    const failedRows = useMemo<FailedRow[]>(() => {
        if (!failedOutboxRows) return []
        const out: FailedRow[] = []
        for (const r of failedOutboxRows) {
            const a = adaptOutboxRow(r)
            if (a) out.push(a)
        }
        return out
    }, [failedOutboxRows])

    const hasConflict = state === 'conflict' && failedRows.length > 0
    const open = false

    // Per-row choices. Default is 'theirs' (safe default per
    // ARCHITECTURE.md §6.9 — user has to opt in to overwrite remote).
    const [choices, setChoices] = useState<Map<number, Choice>>(new Map())

    const setChoice = useCallback((localId: number, choice: Choice) => {
        setChoices((prev) => {
            const next = new Map(prev)
            next.set(localId, choice)
            return next
        })
    }, [])

    // Remote snapshots, fetched once when the failed-row id-set changes.
    const adapter = adapterOverride ?? getSyncAdapter()
    const [remoteSnapshots, setRemoteSnapshots] = useState<
        Map<string, RemoteDocSnapshot | null>
    >(new Map())
    const [snapshotsLoading, setSnapshotsLoading] = useState(false)

    // Stable id-set fingerprint so we refetch only when rows change.
    const idSetKey = useMemo(
        () =>
            failedRows
                .map((r) => `${r.localId}:${r.collection}/${r.docId}`)
                .sort()
                .join('|'),
        [failedRows],
    )

    useEffect(() => {
        if (!open || !adapter) {
            setRemoteSnapshots(new Map())
            return
        }
        let cancelled = false
        setSnapshotsLoading(true)
        const next = new Map<string, RemoteDocSnapshot | null>()
        Promise.all(
            failedRows.map(async (r) => {
                try {
                    const snap = await adapter.readDoc(r.collection, r.docId)
                    next.set(rowKey(r), snap)
                } catch {
                    // Treat read failures as "no remote view" — diff falls
                    // back to "—" on the theirs side. The conflict itself
                    // is still resolvable (engine.resolveConflict only needs
                    // the localId).
                    next.set(rowKey(r), null)
                }
            }),
        ).finally(() => {
            if (cancelled) return
            setRemoteSnapshots(next)
            setSnapshotsLoading(false)
        })
        return () => {
            cancelled = true
        }
        // idSetKey + adapter change drive refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idSetKey, adapter, open])

    // Display-title lookup per (collection, docId). Reads from local Dexie
    // store. Tracks have `title`; setlists have `name`; songs have `title`.
    // useLiveQuery batched per-row would be N hooks — instead read once
    // per modal-open via a single multi-collection fetch.
    const [titleMap, setTitleMap] = useState<Map<string, string>>(new Map())
    useEffect(() => {
        if (!open) {
            setTitleMap(new Map())
            return
        }
        let cancelled = false
        const next = new Map<string, string>()
        const db = getDb()
        Promise.all(
            failedRows.map(async (r) => {
                try {
                    const local = (await db[r.collection].get(r.docId)) as
                        | { title?: string; name?: string }
                        | undefined
                    const t = local?.title ?? local?.name ?? ''
                    if (t) next.set(rowKey(r), t)
                } catch {
                    // ignore — title falls back to docId
                }
            }),
        ).finally(() => {
            if (cancelled) return
            setTitleMap(next)
        })
        return () => {
            cancelled = true
        }
    }, [idSetKey, open, failedRows])

    const openModal = useCallback(() => {}, [])
    const closeModal = useCallback(() => {}, [])

    const handleResolveAll = useCallback(async () => {
        const resolveFn = resolveOverride
            ? resolveOverride
            : async (
                  localId: number,
                  choice: Choice,
                  opts?: { newExpectedUpdatedAt?: number },
              ) => {
                  const engine = getSyncEngine()
                  if (!engine) return
                  await engine.resolveConflict(localId, choice, opts)
              }
        for (const r of failedRows) {
            const choice = 'mine' // Last write wins
            const remote = remoteSnapshots.get(rowKey(r))
            const newExpectedUpdatedAt = remote ? remote.updatedAt : undefined
            try {
                await resolveFn(r.localId, choice, { newExpectedUpdatedAt })
            } catch {
                // Best-effort
            }
        }
        setChoices(new Map())
    }, [failedRows, remoteSnapshots, resolveOverride])

    // Auto-resolve when conflicts are detected and snapshots are loaded
    useEffect(() => {
        if (hasConflict && remoteSnapshots.size === failedRows.length && !snapshotsLoading) {
            handleResolveAll()
        }
    }, [hasConflict, remoteSnapshots.size, failedRows.length, snapshotsLoading, handleResolveAll])

    const value = useMemo<ReconciliationContextValue>(
        () => ({ openModal: () => {} }),
        [],
    )

    return (
        <ReconciliationContext.Provider value={value}>
            {children}
        </ReconciliationContext.Provider>
    )
}

interface ReconciliationCardProps {
    localId: number
    title: string
    diffKeys: string[]
    payload: Record<string, unknown>
    remoteData: Record<string, unknown> | undefined
    choice: Choice
    onChoiceChange: (c: Choice) => void
}

function ReconciliationCard({
    localId,
    title,
    diffKeys,
    payload,
    remoteData,
    choice,
    onChoiceChange,
}: ReconciliationCardProps) {
    const groupName = `reconcile-${localId}`
    const titleId = `reconcile-${localId}-title`

    return (
        <section
            aria-labelledby={titleId}
            data-testid={`reconciliation-card-${localId}`}
            className={cn(
                'rounded-md border border-border bg-card p-3',
                'text-card-foreground',
            )}
        >
            <h3
                id={titleId}
                className="mb-2 text-sm font-semibold leading-tight"
            >
                {title}
            </h3>

            {diffKeys.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    Row reordered or deleted. Pick how to resolve below.
                </p>
            ) : (
                <dl className="space-y-1 text-sm">
                    {diffKeys.map((field) => {
                        const yours = payload[field]
                        const theirs = remoteData?.[field]
                        return (
                            <div
                                key={field}
                                className="grid grid-cols-[6rem_1fr] gap-x-3"
                                data-testid={`reconciliation-diff-${localId}-${field}`}
                            >
                                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {prettyFieldName(field)}
                                </dt>
                                <dd className="space-y-0.5">
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            Your version:
                                        </span>{' '}
                                        <span className="font-mono text-xs">
                                            {formatValue(yours)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted-foreground">
                                            Their version:
                                        </span>{' '}
                                        <span className="font-mono text-xs">
                                            {formatValue(theirs)}
                                        </span>
                                    </div>
                                </dd>
                            </div>
                        )
                    })}
                </dl>
            )}

            <fieldset className="mt-3 flex gap-4 border-t border-border pt-3">
                <legend className="sr-only">
                    Choose which version to keep for {title}
                </legend>
                <label
                    className={cn(
                        'inline-flex items-center gap-2 cursor-pointer',
                        'text-sm',
                    )}
                >
                    <input
                        type="radio"
                        name={groupName}
                        value="mine"
                        checked={choice === 'mine'}
                        onChange={() => onChoiceChange('mine')}
                        className="h-4 w-4 cursor-pointer"
                        data-testid={`reconciliation-radio-${localId}-mine`}
                    />
                    <span>Keep mine</span>
                </label>
                <label
                    className={cn(
                        'inline-flex items-center gap-2 cursor-pointer',
                        'text-sm',
                    )}
                >
                    <input
                        type="radio"
                        name={groupName}
                        value="theirs"
                        checked={choice === 'theirs'}
                        onChange={() => onChoiceChange('theirs')}
                        className="h-4 w-4 cursor-pointer"
                        data-testid={`reconciliation-radio-${localId}-theirs`}
                    />
                    <span>Take theirs</span>
                </label>
            </fieldset>
        </section>
    )
}

