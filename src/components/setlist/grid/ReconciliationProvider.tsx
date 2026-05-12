'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
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

/**
 * T1.4 (2026-05-12) — classify outbox.lastError so the modal can label
 * each card with the actual failure cause. Pre-T1.4 the modal rendered
 * "Remote changes detected" for every failed row, including dead-letter
 * (network exhaustion), auth failures, and remote-doc-missing errors —
 * misleading UX. Patterns come from the error message strings produced
 * by engine.handleAdapterError + the typed adapter error classes in
 * firestore-adapter.ts.
 */
export type ErrorKind = 'version-mismatch' | 'remote-missing' | 'auth' | 'transient'

export function classifyOutboxError(lastError: string | undefined): ErrorKind {
    if (!lastError) return 'transient'
    if (/expected updatedAt=/.test(lastError)) return 'version-mismatch'
    if (/isn't on the server|never synced|RemoteDocMissing/.test(lastError))
        return 'remote-missing'
    if (
        /Auth failure|No authenticated user|unauthenticated|permission-denied/.test(
            lastError,
        )
    )
        return 'auth'
    return 'transient'
}

const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
    'version-mismatch': 'Remote change detected',
    'remote-missing': 'Server doesn’t have this row',
    auth: 'Authentication problem',
    transient: 'Save failed (network / server)',
}

const ERROR_KIND_HINT: Record<ErrorKind, string> = {
    'version-mismatch':
        'Someone else changed this while you were editing. Pick which version to keep.',
    'remote-missing':
        'The row was deleted or never landed on the server. Discard the local change to drop it, or keep yours to re-create it.',
    auth: 'Your session may have expired. Sign out and back in, then retry.',
    transient:
        'A network or server error prevented this save. Pick "Keep mine" to retry, or "Take theirs" to discard.',
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

    // P0 modal-flood fix (2026-05-12): the modal is for cross-writer
    // conflicts only. Other failure classes (auth, remote-doc-missing,
    // dead-letter transient) surface via SyncIndicator's "Failed — retry"
    // affordance instead. Without this filter, every dead-lettered
    // transient — including a single network blip after MAX_ATTEMPTS —
    // popped the conflict modal with misleading "Keep mine / Take theirs"
    // radios. T1.4's per-row classifyOutboxError gives us the kind cheaply.
    const conflictRows = useMemo<FailedRow[]>(
        () =>
            failedRows.filter(
                (r) => classifyOutboxError(r.lastError) === 'version-mismatch',
            ),
        [failedRows],
    )

    const hasConflict =
        (state === 'conflict' || state === 'failed') && conflictRows.length > 0

    // Bug 2 fix (2026-05-12): the modal must actually open. The previous
    // `const open = false` plus no-op `openModal/closeModal` stub meant the
    // user never saw conflicts — they were silently auto-resolved as 'mine'
    // (overwriting remote) regardless of intent, and if the retry failed
    // again the row sat in 'failed' forever. We now drive `open` from
    // `hasConflict`, with a `dismissed` ref so the user can close the modal
    // (Cancel/Esc) and not have it pop back open within the same conflict
    // set — but a NEW conflict set re-opens it.
    const [dismissedKey, setDismissedKey] = useState<string | null>(null)

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
    // Computed from `conflictRows` (not all failedRows) so a new non-conflict
    // failure (auth / dead-letter) doesn't mutate the key and re-open the
    // modal the user just dismissed.
    const idSetKey = useMemo(
        () =>
            conflictRows
                .map((r) => `${r.localId}:${r.collection}/${r.docId}`)
                .sort()
                .join('|'),
        [conflictRows],
    )

    // Derive the open state: show the modal whenever there's a conflict and
    // the user hasn't dismissed THIS specific id-set yet. A new conflict
    // (different id-set) re-opens the modal even if the previous one was
    // dismissed.
    const open = hasConflict && dismissedKey !== idSetKey

    useEffect(() => {
        if (!hasConflict || !adapter) {
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
        // idSetKey + adapter + hasConflict change drive refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idSetKey, adapter, hasConflict])

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

    // Real open / close handlers (the previous no-op stubs are what made the
    // modal invisible). `openModal` is called from SyncIndicator's conflict
    // action button when the user has dismissed and wants to revisit; it
    // clears `dismissedKey` so `open` becomes true again for the current
    // conflict set.
    const openModal = useCallback(() => {
        setDismissedKey(null)
    }, [])
    const closeModal = useCallback(() => {
        setDismissedKey(idSetKey)
    }, [idSetKey])

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
            // Bug 2 fix (2026-05-12): respect the user's per-row choice.
            // The previous hardcoded 'mine' silently overwrote cross-device
            // edits regardless of intent. Default is 'theirs' (safe — user
            // must opt in to overwrite remote), matching the documented
            // intent in ARCHITECTURE.md §6.9.
            const choice = choices.get(r.localId) ?? 'theirs'
            const remote = remoteSnapshots.get(rowKey(r))
            // newExpectedUpdatedAt is only meaningful for 'mine' — when the
            // engine retries the user's write it needs a precondition that
            // matches the current remote. For 'theirs', the outbox row is
            // simply deleted without applying anything (engine.resolveConflict
            // semantics), so the precondition is moot.
            const newExpectedUpdatedAt =
                choice === 'mine' && remote ? remote.updatedAt : undefined
            try {
                await resolveFn(r.localId, choice, { newExpectedUpdatedAt })
            } catch {
                // Best-effort
            }
        }
        setChoices(new Map())
        setDismissedKey(null)
    }, [choices, failedRows, remoteSnapshots, resolveOverride])

    const value = useMemo<ReconciliationContextValue>(
        () => ({ openModal }),
        [openModal],
    )

    // Compute per-row diff keys (fields where payload differs from remote).
    // Done at render so it stays in sync with snapshot state.
    function diffKeysFor(r: FailedRow): string[] {
        const remote = remoteSnapshots.get(rowKey(r))
        const remoteData = (remote?.data ?? {}) as Record<string, unknown>
        const payload = r.payload
        const fields = new Set<string>([
            ...Object.keys(payload),
            ...Object.keys(remoteData),
        ])
        const out: string[] = []
        for (const f of fields) {
            if (DIFF_HIDDEN_FIELDS.has(f)) continue
            if (formatValue(payload[f]) === formatValue(remoteData[f])) continue
            out.push(f)
        }
        return out
    }

    return (
        <ReconciliationContext.Provider value={value}>
            {children}
            <AlertDialog
                open={open}
                onOpenChange={(next) => {
                    if (!next) closeModal()
                }}
            >
                <AlertDialogContent
                    data-testid="reconciliation-dialog"
                    onEscapeKeyDown={() => {
                        closeModal()
                    }}
                    className="max-w-2xl"
                >
                    {(() => {
                        // T1.4: derive title + lead copy from the row error
                        // kinds. When all rows are VersionMismatch, keep the
                        // legacy "Remote changes detected" title (tests +
                        // existing UX). When any row is a non-conflict
                        // failure, switch to neutral title; per-row cards
                        // surface the specific cause.
                        const kinds = failedRows.map((r) =>
                            classifyOutboxError(r.lastError),
                        )
                        const allVersionMismatch = kinds.every(
                            (k) => k === 'version-mismatch',
                        )
                        const title = allVersionMismatch
                            ? 'Remote changes detected'
                            : 'Some saves need attention'
                        const desc = allVersionMismatch
                            ? `Someone else (or another device) changed ${failedRows.length === 1 ? 'this row' : 'these rows'} while you were editing. Pick which version to keep. "Take theirs" is the safe default.`
                            : `${failedRows.length === 1 ? 'A row' : `${failedRows.length} rows`} couldn’t be saved. Each card below explains why and what to do.`
                        return (
                            <AlertDialogHeader>
                                <AlertDialogTitle data-testid="reconciliation-title">
                                    {title}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {desc}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                        )
                    })()}

                    <div className="max-h-[60vh] overflow-y-auto space-y-3 py-2">
                        {failedRows.map((r) => {
                            const remote = remoteSnapshots.get(rowKey(r))
                            const title =
                                titleMap.get(rowKey(r)) ?? r.docId
                            const choice = choices.get(r.localId) ?? 'theirs'
                            const kind = classifyOutboxError(r.lastError)
                            return (
                                <ReconciliationCard
                                    key={r.localId}
                                    localId={r.localId}
                                    title={title}
                                    diffKeys={diffKeysFor(r)}
                                    payload={r.payload}
                                    remoteData={
                                        (remote?.data ?? undefined) as
                                            | Record<string, unknown>
                                            | undefined
                                    }
                                    choice={choice}
                                    onChoiceChange={(c) =>
                                        setChoice(r.localId, c)
                                    }
                                    errorKindLabel={ERROR_KIND_LABEL[kind]}
                                    errorKindHint={ERROR_KIND_HINT[kind]}
                                    errorKindTestId={kind}
                                />
                            )
                        })}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel
                            data-testid="reconciliation-cancel"
                            onClick={() => closeModal()}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            data-testid="reconciliation-resolve"
                            onClick={() => {
                                void handleResolveAll()
                            }}
                            disabled={
                                snapshotsLoading ||
                                remoteSnapshots.size < failedRows.length
                            }
                        >
                            Resolve all and save
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
    /** T1.4: classified error kind shown above the diff so the user can
     *  tell a real conflict from a network/auth/missing-doc failure. */
    errorKindLabel?: string
    errorKindHint?: string
    errorKindTestId?: string
}

function ReconciliationCard({
    localId,
    title,
    diffKeys,
    payload,
    remoteData,
    choice,
    onChoiceChange,
    errorKindLabel,
    errorKindHint,
    errorKindTestId,
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

            {errorKindLabel ? (
                <div
                    className="mb-2 rounded-sm border border-amber-400/30 bg-amber-500/5 px-2 py-1"
                    data-testid={`reconciliation-error-kind-${localId}`}
                    data-error-kind={errorKindTestId}
                >
                    <p className="text-xs font-semibold text-amber-300">
                        {errorKindLabel}
                    </p>
                    {errorKindHint ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {errorKindHint}
                        </p>
                    ) : null}
                </div>
            ) : null}

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

