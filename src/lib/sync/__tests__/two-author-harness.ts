/**
 * Two-author sync harness (investigate/sync-repro, 2026-11-03).
 *
 * Builds N independent "devices" in one vitest process. Each device gets its
 * OWN module graph (vi.resetModules + vi.doMock), so each has:
 *   - its own Dexie database (fake-indexeddb, distinct name),
 *   - the REAL SyncEngine + REAL ProductionFirestoreAdapter (booted through
 *     the real <SyncEngineBoot/> component), wired to its own sync store,
 *   - the REAL snapshot listener (the production lazy subscriber, i.e. the
 *     same `where('setlistId','==',…)` query the app runs),
 *   - its own modular Web SDK Firestore, signed in through the Auth emulator
 *     with a custom token carrying the persona's `m` claims, so every write
 *     and every listen is judged by the real firestore.rules.
 *
 * Only three things are stubbed per device: `@/lib/firebase` (hands the
 * device's Firestore/Auth to the real code), the cross-tab lock (two devices
 * in one jsdom would otherwise share one BroadcastChannel and behave like two
 * tabs of ONE browser), and Sentry capture (recorded instead of sent).
 *
 * Nothing here touches production: the project id is demo-*, and every
 * write goes to the emulator.
 */
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

import { initializeApp as initWebApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
    connectAuthEmulator,
    getAuth,
    signInWithCustomToken,
} from 'firebase/auth'
import {
    connectFirestoreEmulator,
    initializeFirestore,
    terminate,
    type Firestore,
} from 'firebase/firestore'

import type { LocalTrack, OutboxRow } from '@/lib/local/types'

export const PROJECT_ID = 'demo-sync-repro'

type SchemaMod = typeof import('@/lib/local/schema')
type WriteMod = typeof import('@/lib/local/write')
type InitMod = typeof import('@/lib/sync/init')
type ListenerMod = typeof import('@/lib/sync/snapshot-listener')
type StoreMod = typeof import('@/lib/sync/store')

export interface StateEvent {
    t: number
    state: string
    queued: number
    lastError?: string
}

export interface Device {
    name: string
    uid: string
    fs: Firestore
    app: FirebaseApp
    db: ReturnType<SchemaMod['getDb']>
    applyEdit: WriteMod['applyEdit']
    engine: NonNullable<ReturnType<InitMod['getSyncEngine']>>
    store: StoreMod['useSyncStatus']
    states: StateEvent[]
    listenerWarnings: Array<{ msg: string; err: string }>
    sentry: Array<Record<string, unknown>>
    /** Every Dexie order-sequence this device rendered, in time order. */
    seenOrders: string[]
    startListener(setlistId: string): void
    stopListener(): void
    shutdown(): Promise<void>
    rows(setlistId: string): Promise<LocalTrack[]>
    outbox(): Promise<OutboxRow[]>
    editLog(): Promise<Array<Record<string, unknown>>>
}

let adminDbP: Promise<import('firebase-admin/firestore').Firestore> | null = null

export async function adminDb(): Promise<import('firebase-admin/firestore').Firestore> {
    if (!adminDbP) {
        adminDbP = (async () => {
            const { initializeApp, getApps } = await import('firebase-admin/app')
            const { getFirestore } = await import('firebase-admin/firestore')
            if (!getApps().some((a) => a.name === '[DEFAULT]')) {
                initializeApp({ projectId: PROJECT_ID })
            }
            return getFirestore()
        })()
    }
    return adminDbP
}

/** Sort exactly as SetlistGrid's useLiveQuery does (R-11b: order, then id). */
export function gridSort<T extends { order: number; id: string }>(rows: T[]): T[] {
    return rows.slice().sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
}

/** Verbatim copy of SetlistGrid.tsx `computeReorderUpdates` (line ~944).
 *  Copied rather than imported so the harness doesn't load the whole grid UI. */
export function computeReorderUpdates(
    currentRows: Array<Pick<LocalTrack, 'id' | 'order'>>,
    activeId: string,
    overId: string,
): Array<{ id: string; order: number }> {
    if (activeId === overId) return []
    const oldIndex = currentRows.findIndex((r) => r.id === activeId)
    const newIndex = currentRows.findIndex((r) => r.id === overId)
    if (oldIndex < 0 || newIndex < 0) return []
    const reordered = currentRows.slice()
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    const updates: Array<{ id: string; order: number }> = []
    for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].order !== i) updates.push({ id: reordered[i].id, order: i })
    }
    return updates
}

let deviceSeq = 0

export async function makeDevice(
    name: string,
    uid: string,
    claims: Record<string, unknown>,
): Promise<Device> {
    const tag = `${name}-${++deviceSeq}`
    const { getAuth: getAdminAuth } = await import('firebase-admin/auth')
    await adminDb()
    const token = await getAdminAuth().createCustomToken(uid, claims)

    const app = initWebApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, tag)
    const fs = initializeFirestore(app, {})
    const [h, p] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
    connectFirestoreEmulator(fs, h, Number.parseInt(p, 10))
    const auth = getAuth(app)
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
        disableWarnings: true,
    })
    await signInWithCustomToken(auth, token)

    const sentry: Array<Record<string, unknown>> = []
    const listenerWarnings: Array<{ msg: string; err: string }> = []

    vi.resetModules()
    vi.doMock('@/lib/firebase', () => ({
        app,
        auth,
        googleProvider: {},
        getDb: async () => fs,
        subscribeWithDb: (setup: (db: Firestore) => () => void) => {
            let inner: (() => void) | null = null
            let cancelled = false
            void Promise.resolve(fs).then((db) => {
                if (!cancelled) inner = setup(db)
            })
            return () => {
                cancelled = true
                inner?.()
                inner = null
            }
        },
        clearFirestoreIndexedDB: async () => {},
        recoverFromFirestoreShutdown: () => false,
    }))
    vi.doMock('@/lib/local/schema', async () => {
        const actual = await vi.importActual<SchemaMod>('@/lib/local/schema')
        const db = new actual.LocalDb(`crc-local-${tag}`)
        return { ...actual, getDb: () => db, resetDbForTests: async () => {} }
    })
    vi.doMock('@/lib/sync/cross-tab-lock', () => ({
        CrossTabLock: class {
            readonly tabId = tag
            tryAcquire() {
                return true
            }
            onAvailable() {}
            onLost() {}
            shutdown() {}
            isHolder() {
                return true
            }
        },
    }))
    vi.doMock('@/lib/sync/sentry-capture', () => ({
        captureSyncFailure: (err: unknown, ctx: Record<string, unknown>) => {
            sentry.push({ ...ctx, error: err instanceof Error ? err.message : String(err) })
        },
    }))

    const schema = (await import('@/lib/local/schema')) as SchemaMod
    const write = (await import('@/lib/local/write')) as WriteMod
    const init = (await import('@/lib/sync/init')) as InitMod
    const listener = (await import('@/lib/sync/snapshot-listener')) as ListenerMod
    const storeMod = (await import('@/lib/sync/store')) as StoreMod

    const db = schema.getDb()
    render(createElement(init.SyncEngineBoot))
    const engine = init.getSyncEngine()
    if (!engine) throw new Error(`device ${name}: engine did not boot`)

    const states: StateEvent[] = []
    const wired = engine.onStateChange
    engine.onStateChange = (state, queued, lastError) => {
        states.push({ t: Date.now(), state, queued, lastError })
        wired?.(state, queued, lastError)
    }

    const seenOrders: string[] = []
    let stop: (() => void) | null = null
    let poll: ReturnType<typeof setInterval> | null = null

    const rows = async (setlistId: string) =>
        gridSort((await db.tracks.where('setlistId').equals(setlistId).toArray()) as LocalTrack[])

    const device: Device = {
        name,
        uid,
        fs,
        app,
        db,
        applyEdit: write.applyEdit,
        engine,
        store: storeMod.useSyncStatus,
        states,
        listenerWarnings,
        sentry,
        seenOrders,
        startListener(setlistId: string) {
            stop = listener.startSnapshotListener({
                setlistId,
                db,
                logger: {
                    warn: (msg: string, err?: unknown) =>
                        listenerWarnings.push({
                            msg,
                            err:
                                err && typeof err === 'object' && 'code' in err
                                    ? `${(err as { code: string }).code}: ${(err as unknown as Error).message}`
                                    : String(err),
                        }),
                },
            })
            // Sample what the grid would render (useLiveQuery re-runs on every
            // Dexie write; 15 ms sampling catches each listener batch).
            poll = setInterval(() => {
                void rows(setlistId).then((r) => {
                    const sig = r.map((x) => `${x.id}:${x.order}`).join(',')
                    if (seenOrders[seenOrders.length - 1] !== sig) seenOrders.push(sig)
                })
            }, 15)
        },
        stopListener() {
            stop?.()
            stop = null
            if (poll) clearInterval(poll)
            poll = null
        },
        async shutdown() {
            device.stopListener()
            init.shutdownSyncEngine()
            try {
                await terminate(fs)
                await deleteApp(app)
            } catch {
                // best effort
            }
            db.close()
        },
        rows,
        outbox: () => db.outbox.toArray(),
        editLog: () => db.edit_log.toArray() as unknown as Promise<Array<Record<string, unknown>>>,
    }
    return device
}

/** Seed a setlist + `n` tracks through the Admin SDK (rules bypassed), stamped
 *  exactly like production rows (orgId, server updatedAt). */
export async function seedSetlist(setlistId: string, n: number, ownerId = 'u-daniel'): Promise<void> {
    const db = await adminDb()
    const { FieldValue } = await import('firebase-admin/firestore')
    const batch = db.batch()
    batch.set(db.collection('setlists').doc(setlistId), {
        name: `Repro ${setlistId}`,
        ownerId,
        orgId: 'crc',
        hydrated: true,
        trackCount: n,
        version: 1,
        updatedAt: FieldValue.serverTimestamp(),
    })
    for (let i = 0; i < n; i++) {
        const id = `${setlistId}-t${String(i).padStart(2, '0')}`
        batch.set(db.collection('tracks').doc(id), {
            id,
            setlistId,
            orgId: 'crc',
            order: i,
            title: `Song ${i}`,
            type: 'song',
            version: 1,
            updatedAt: FieldValue.serverTimestamp(),
        })
    }
    await batch.commit()
}

/** What `getTracksForSetlist` (the SSR / reload frame) returns, sorted. */
export async function serverRows(setlistId: string): Promise<LocalTrack[]> {
    const db = await adminDb()
    const snap = await db.collection('tracks').where('setlistId', '==', setlistId).get()
    return gridSort(
        snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>
            const u = data.updatedAt as { toMillis?: () => number } | undefined
            return {
                ...data,
                id: d.id,
                setlistId,
                order: typeof data.order === 'number' ? data.order : 0,
                updatedAt: typeof u?.toMillis === 'function' ? u.toMillis() : 0,
            } as LocalTrack
        }),
    )
}

/** Prime a device's Dexie the way SetlistGridHydrator does on page load
 *  (bulkPut of the SSR frame, skipping outbox / tombstoned / not-newer rows). */
export async function primeFromServer(dev: Device, setlistId: string): Promise<void> {
    const db = await adminDb()
    const s = await db.collection('setlists').doc(setlistId).get()
    const sd = s.data() as Record<string, unknown>
    const su = sd.updatedAt as { toMillis: () => number }
    const initialTracks = await serverRows(setlistId)
    const ldb = dev.db
    await ldb.transaction('rw', ldb.setlists, ldb.tracks, ldb.outbox, ldb.tombstones, async () => {
        const outboxIds = new Set((await ldb.outbox.toArray()).map((r) => r.docId))
        if (!outboxIds.has(setlistId)) {
            const local = await ldb.setlists.get(setlistId)
            if (!local || (local.updatedAt ?? 0) < su.toMillis()) {
                await ldb.setlists.put({ ...sd, id: setlistId, updatedAt: su.toMillis() } as never)
            }
        }
        const toPut: LocalTrack[] = []
        for (const t of initialTracks) {
            if (outboxIds.has(t.id)) continue
            if (await ldb.tombstones.get(['tracks', t.id])) continue
            const local = await ldb.tracks.get(t.id)
            if (!local || ((local.updatedAt as number | undefined) ?? 0) < (t.updatedAt ?? 0)) toPut.push(t)
        }
        if (toPut.length) await ldb.tracks.bulkPut(toPut)
    })
}

export async function waitFor(
    cond: () => Promise<boolean> | boolean,
    timeoutMs = 8000,
    stepMs = 50,
): Promise<boolean> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
        if (await cond()) return true
        await new Promise((r) => setTimeout(r, stepMs))
    }
    return false
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Drag `activeId` onto `overId` exactly as SetlistGrid/MobileCardList
 *  handleDragEnd does: N parallel per-row `applyEdit` order patches, each
 *  carrying the row's own local `updatedAt` as its precondition. */
export async function dragRow(dev: Device, setlistId: string, activeId: string, overId: string) {
    const rows = await dev.rows(setlistId)
    const updates = computeReorderUpdates(rows, activeId, overId)
    await Promise.all(
        updates.map(({ id, order }) => {
            const r = rows.find((row) => row.id === id)
            return dev.applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: id,
                    patch: { order },
                    expectedUpdatedAt: r?.updatedAt,
                },
                { withoutUndo: true },
            )
        }),
    )
    return updates
}

/** AddBar "pick song" / free-text add exactly as SetlistGrid handlePickSong:
 *  one `set` at order = rows.length. */
export async function addRowAtEnd(dev: Device, setlistId: string, id: string, title: string) {
    const rows = await dev.rows(setlistId)
    await dev.applyEdit({
        op: 'set',
        collection: 'tracks',
        doc: { id, setlistId, order: rows.length, title, type: 'song' },
    })
    return rows.length
}

/** Context-menu Duplicate exactly as SetlistGrid handleContextDuplicate:
 *  parallel +1 bumps for every row at/after source.order+1, then a `set` of
 *  the clone (which copies the source's fields, including its `updatedAt`). */
export async function duplicateRow(dev: Device, setlistId: string, sourceId: string, newId: string) {
    const rows = await dev.rows(setlistId)
    const source = rows.find((r) => r.id === sourceId)!
    const newOrder = source.order + 1
    const cascade = rows.filter((r) => r.order >= newOrder)
    await Promise.all(
        cascade.map((r) =>
            dev.applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: r.id,
                    patch: { order: r.order + 1 },
                    expectedUpdatedAt: r.updatedAt,
                },
                { withoutUndo: true },
            ),
        ),
    )
    await dev.applyEdit(
        { op: 'set', collection: 'tracks', doc: { ...source, id: newId, order: newOrder } },
        { withoutUndo: true },
    )
    return newOrder
}

export function ordersOf(rows: Array<{ order: number }>): number[] {
    return rows.map((r) => r.order)
}

export function summarize(rows: Array<{ id: string; order: number }>): string {
    return rows.map((r) => `${r.id.replace(/^.*-/, '')}@${r.order}`).join(' ')
}
