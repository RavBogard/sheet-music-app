// Local-first sync engine — drains the IDB outbox to Firestore with retry,
// dead-letter, version-mismatch handling, offline awareness, and cross-tab
// coordination. Built standalone for v50-03; consumed by v50-05 cutover.
//
// Bound by ARCHITECTURE.md §3.

import type { LocalDb } from '../local/schema'
import { getDb } from '../local/schema'
import type { OutboxRow } from '../local/types'

import type { CrossTabLock } from './cross-tab-lock'
import {
    AuthError,
    type FirestoreAdapter,
    NetworkError,
    TransientError,
    VersionMismatchError,
} from './firestore-adapter'
import { captureSyncFailure } from './sentry-capture'
import {
    type SyncEvent,
    type SyncState,
    deriveStateFromOutbox,
    transition,
} from './state-machine'

// Backoff schedule per ARCHITECTURE.md §3.3.
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const
const MAX_ATTEMPTS = 5
const PUMP_SENTINEL_MS = 30_000

export interface EngineClock {
    now(): number
    setTimeout(fn: () => void, ms: number): unknown
    clearTimeout(handle: unknown): void
}

const defaultClock: EngineClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface SyncEngineOptions {
    db?: LocalDb
    adapter: FirestoreAdapter
    lock: CrossTabLock
    clock?: EngineClock
    onStateChange?: (state: SyncState, queued: number, lastError?: string) => void
    isOnline?: () => boolean
    onlineListener?: {
        addListener(event: 'online' | 'offline', cb: () => void): void
        removeListener(event: 'online' | 'offline', cb: () => void): void
    }
}

export class SyncEngine {
    private readonly db: LocalDb
    private readonly adapter: FirestoreAdapter
    private readonly lock: CrossTabLock
    private readonly clock: EngineClock
    onStateChange?: SyncEngineOptions['onStateChange']
    private readonly isOnline: () => boolean
    private readonly onlineListener: NonNullable<
        SyncEngineOptions['onlineListener']
    > | null

    private state: SyncState = 'idle'
    private lastError?: string
    private pumpHandle: unknown = null
    private started = false
    private draining = false
    private wantsRedrain = false
    private onlineHandler: (() => void) | null = null
    private offlineHandler: (() => void) | null = null

    constructor(opts: SyncEngineOptions) {
        this.db = opts.db ?? getDb()
        this.adapter = opts.adapter
        this.lock = opts.lock
        this.clock = opts.clock ?? defaultClock
        this.onStateChange = opts.onStateChange
        this.isOnline =
            opts.isOnline ??
            (() =>
                typeof navigator === 'undefined' ? true : navigator.onLine)
        this.onlineListener = this.resolveOnlineListener(opts.onlineListener)
    }

    private resolveOnlineListener(
        explicit: SyncEngineOptions['onlineListener'],
    ): NonNullable<SyncEngineOptions['onlineListener']> | null {
        if (explicit) return explicit
        if (typeof globalThis === 'undefined') return null
        const w = (globalThis as { window?: Window }).window
        if (!w || typeof w.addEventListener !== 'function') return null
        return {
            addListener: (event, cb) => w.addEventListener(event, cb),
            removeListener: (event, cb) => w.removeEventListener(event, cb),
        }
    }

    async start(): Promise<void> {
        if (this.started) return
        this.started = true

        // Reset any 'sending' rows orphaned by a force-quit. Without this,
        // they'd block later rows for the same doc forever (per-doc ordering
        // treats 'sending' as held). Bump scheduledFor to now so they retry.
        const orphaned = await this.db.outbox
            .where('status')
            .equals('sending')
            .toArray()
        for (const row of orphaned) {
            await this.db.outbox.update(row.localId!, {
                status: 'pending',
                scheduledFor: this.clock.now(),
            })
        }

        const rows = await this.db.outbox.toArray()
        this.state = this.isOnline()
            ? deriveStateFromOutbox(rows)
            : 'offline'
        this.notify(rows.length)

        if (this.onlineListener) {
            this.onlineHandler = () => this.dispatch({ type: 'NETWORK_ONLINE' })
            this.offlineHandler = () =>
                this.dispatch({ type: 'NETWORK_OFFLINE' })
            this.onlineListener.addListener('online', this.onlineHandler)
            this.onlineListener.addListener('offline', this.offlineHandler)
        }

        this.lock.onAvailable(() => {
            if (this.started) void this.pump()
        })
        this.lock.onLost(() => {
            this.draining = false
        })

        if (this.state !== 'offline') {
            await this.pump()
        }
    }

    shutdown(): void {
        if (!this.started) return
        this.started = false
        if (this.pumpHandle != null) {
            this.clock.clearTimeout(this.pumpHandle)
            this.pumpHandle = null
        }
        if (this.onlineListener) {
            if (this.onlineHandler)
                this.onlineListener.removeListener('online', this.onlineHandler)
            if (this.offlineHandler)
                this.onlineListener.removeListener(
                    'offline',
                    this.offlineHandler,
                )
        }
        this.lock.shutdown()
    }

    getState(): SyncState {
        return this.state
    }

    async pump(): Promise<void> {
        if (!this.started) return
        if (this.draining) {
            this.wantsRedrain = true
            return
        }
        if (!this.isOnline()) {
            this.dispatch({ type: 'NETWORK_OFFLINE' })
            await this.notifyFromDb()
            return
        }
        if (!this.lock.tryAcquire()) return

        this.draining = true
        try {
            await this.drainOnce()
        } finally {
            this.draining = false
            await this.notifyFromDb()
            if (this.wantsRedrain) {
                this.wantsRedrain = false
                await this.pump()
            } else {
                await this.scheduleNextPump()
            }
        }
    }

    private async drainOnce(): Promise<void> {
        const now = this.clock.now()
        // Per-doc ordering: only drain the OLDEST pending row per
        // (collection, docId), and only if it's due now and no earlier
        // failed/sending row blocks it. This preserves LWW per-document
        // semantics — without it, a transient failure on row N could let
        // row N+1 for the same doc leapfrog on the server.
        const allRows = await this.db.outbox.toArray()
        const oldestPerDoc = new Map<string, OutboxRow>()
        const blockedDocs = new Set<string>()
        for (const r of allRows) {
            const k = `${r.collection}/${r.docId}`
            if (r.status === 'failed' || r.status === 'sending') {
                blockedDocs.add(k)
                continue
            }
            const cur = oldestPerDoc.get(k)
            if (!cur || (r.localId ?? 0) < (cur.localId ?? 0)) {
                oldestPerDoc.set(k, r)
            }
        }
        const dueRows = Array.from(oldestPerDoc.entries())
            .filter(([k, r]) => !blockedDocs.has(k) && r.scheduledFor <= now)
            .map(([, r]) => r)
        dueRows.sort(
            (a, b) =>
                a.scheduledFor - b.scheduledFor ||
                (a.localId ?? 0) - (b.localId ?? 0),
        )

        if (dueRows.length === 0) {
            // Nothing due — derive state from outbox shape.
            const queued = await this.db.outbox.count()
            if (queued === 0) {
                this.dispatch({ type: 'DRAIN_OK' })
            }
            return
        }

        this.dispatch({ type: 'DRAIN_STARTED' })

        for (const row of dueRows) {
            if (!this.started) return
            if (!this.isOnline()) {
                this.dispatch({ type: 'NETWORK_OFFLINE' })
                return
            }

            await this.db.outbox.update(row.localId!, { status: 'sending' })

            try {
                const result = await this.adapter.commitOutboxRow(row)
                // v50-06-01: write the new server `updatedAt` back into the
                // local row inside the SAME Dexie tx that deletes the outbox
                // row. This keeps the local doc's `updatedAt` in sync with
                // the server so the editor's next edit can pass an honest
                // `expectedUpdatedAt` precondition. Atomic: either both
                // land or both roll back. Skipped for delete ops (no
                // resulting doc) and when the adapter doesn't surface a
                // server timestamp (test fakes; legacy adapters).
                await this.db.transaction(
                    'rw',
                    this.db.outbox,
                    this.db[row.collection],
                    async () => {
                        await this.db.outbox.delete(row.localId!)
                        if (
                            result.updatedAt !== undefined &&
                            row.op !== 'delete'
                        ) {
                            const existing = await this.db[
                                row.collection
                            ].get(row.docId)
                            if (existing) {
                                await this.db[row.collection].put({
                                    ...existing,
                                    updatedAt: result.updatedAt,
                                } as never)
                            }
                            // Guard: if the user deleted the row mid-flight,
                            // skip the writeback rather than resurrecting it.
                        }
                    },
                )
                continue
            } catch (err) {
                const handled = await this.handleAdapterError(row, err)
                if (handled === 'stop-drain') return
            }
        }

        // Loop completed without stop-drain. Derive final FSM state.
        const remaining = await this.db.outbox.count()
        if (remaining === 0) {
            this.dispatch({ type: 'DRAIN_OK' })
        }
        // If retries are pending (transient errors handed back 'continue'),
        // the dispatched DRAIN_RETRY_PENDING events have already kept the FSM
        // in 'saving'. Subsequent pumps from the timer chain will resolve it.
    }

    private async handleAdapterError(
        row: OutboxRow,
        err: unknown,
    ): Promise<'continue' | 'stop-drain'> {
        const localId = row.localId!
        const lastError =
            err instanceof Error ? err.message : String(err ?? 'unknown')
        this.lastError = lastError

        if (err instanceof VersionMismatchError) {
            await this.db.outbox.update(localId, {
                status: 'failed',
                lastError,
            })
            this.dispatch({ type: 'DRAIN_VERSION_MISMATCH' })
            return 'stop-drain'
        }

        if (err instanceof AuthError) {
            // One-shot refresh + immediate in-loop retry per ARCHITECTURE.md §3.3.
            if (row.attempts === 0) {
                try {
                    await this.adapter.refreshAuthToken()
                    try {
                        const fresh = { ...row, attempts: 1 }
                        await this.adapter.commitOutboxRow(fresh)
                        await this.db.outbox.delete(localId)
                        return 'continue'
                    } catch (retryErr) {
                        // Second-attempt failure → mark failed; user must act.
                        const retryMsg =
                            retryErr instanceof Error
                                ? retryErr.message
                                : String(retryErr)
                        this.lastError = retryMsg
                        await this.db.outbox.update(localId, {
                            status: 'failed',
                            attempts: 1,
                            lastError: retryMsg,
                        })
                        this.dispatch({ type: 'DRAIN_AUTH_FAILED' })
                        return 'stop-drain'
                    }
                } catch {
                    // Refresh itself failed — permanent failure.
                }
            }
            await this.db.outbox.update(localId, {
                status: 'failed',
                attempts: row.attempts + 1,
                lastError,
            })
            this.dispatch({ type: 'DRAIN_AUTH_FAILED' })
            return 'stop-drain'
        }

        if (err instanceof NetworkError) {
            // Restore to pending so it drains on resume.
            await this.db.outbox.update(localId, {
                status: 'pending',
                lastError,
            })
            this.dispatch({ type: 'NETWORK_OFFLINE' })
            return 'stop-drain'
        }

        // TransientError or anything else → backoff retry.
        const nextAttempts = row.attempts + 1
        if (nextAttempts >= MAX_ATTEMPTS) {
            await this.db.outbox.update(localId, {
                status: 'failed',
                attempts: nextAttempts,
                lastError,
            })
            // v50-07-05: Sentry capture on dead-letter transition. The user's
            // edit is observable in the outbox at 'failed' status but won't
            // drain without intervention (manual reconciliation or row delete).
            // High-severity alert.
            captureSyncFailure(err, {
                feature: 'dead-letter',
                collection: row.collection,
                docId: row.docId,
                op: row.op,
                attempts: nextAttempts,
            })
            this.dispatch({ type: 'DRAIN_BUDGET_EXHAUSTED' })
            return 'stop-drain'
        }
        const delay = BACKOFF_MS[nextAttempts - 1]
        await this.db.outbox.update(localId, {
            status: 'pending',
            attempts: nextAttempts,
            scheduledFor: this.clock.now() + delay,
            lastError,
        })
        this.dispatch({ type: 'DRAIN_RETRY_PENDING' })
        return 'continue'
    }

    private async scheduleNextPump(): Promise<void> {
        if (this.pumpHandle != null) {
            this.clock.clearTimeout(this.pumpHandle)
            this.pumpHandle = null
        }
        const next = await this.db.outbox
            .where('status')
            .equals('pending')
            .toArray()
        if (next.length === 0) return
        const soonest = next.reduce(
            (m, r) => Math.min(m, r.scheduledFor),
            Number.POSITIVE_INFINITY,
        )
        const delay = Math.max(
            0,
            Math.min(PUMP_SENTINEL_MS, soonest - this.clock.now()),
        )
        this.pumpHandle = this.clock.setTimeout(() => {
            this.pumpHandle = null
            void this.pump()
        }, delay)
    }

    async resolveConflict(
        localId: number,
        choice: 'mine' | 'theirs',
        opts?: { newExpectedUpdatedAt?: number },
    ): Promise<void> {
        const row = await this.db.outbox.get(localId)
        if (!row) return
        if (choice === 'theirs') {
            await this.db.outbox.delete(localId)
        } else {
            await this.db.outbox.update(localId, {
                status: 'pending',
                attempts: 0,
                scheduledFor: this.clock.now(),
                expectedUpdatedAt: opts?.newExpectedUpdatedAt,
                lastError: undefined,
            })
        }
        this.dispatch({ type: 'CONFLICT_RESOLVED' })
        await this.pump()
    }

    async notifyEditCommitted(): Promise<void> {
        this.dispatch({ type: 'EDIT_COMMITTED' })
        await this.pump()
    }

    private dispatch(event: SyncEvent): void {
        this.state = transition(this.state, event)
    }

    private async notifyFromDb(): Promise<void> {
        const queued = await this.db.outbox.count()
        this.notify(queued)
    }

    private notify(queued: number): void {
        this.onStateChange?.(this.state, queued, this.lastError)
    }
}
