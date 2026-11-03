/**
 * Two-author sync harness (from investigate/sync-repro 838371d7, adapted to
 * the setlist ops path in PR 3 of the setlist sync redesign).
 *
 * Builds N independent "devices" in one vitest process. Each device gets its
 * OWN module graph (vi.resetModules + vi.doMock), so each has:
 *   - its own Dexie database (fake-indexeddb, distinct name): the server
 *     cache plus its intent queue;
 *   - the REAL setlist ops client (src/lib/setlist-ops-client): the editor's
 *     actions, its queue, its sender, its migration of the old outbox;
 *   - the REAL snapshot listener with the production lazy subscriber;
 *   - its own modular Web SDK Firestore, signed in through the Auth emulator
 *     with a custom token carrying the persona's `m` claims, so every listen
 *     and every read is judged by the real firestore.rules.
 *
 * The ops client's transport calls the REAL op engine (`applyOps`, the code
 * behind POST /api/setlists/{id}/ops) with the device's uid, so authorization
 * runs against the seeded memberships exactly as the route does. The route
 * itself is a thin wrapper (parse, authorize, apply); this skips only HTTP.
 * `pause()` holds the transport, which is what an in-flight request on a slow
 * phone looks like.
 *
 * Only `@/lib/firebase` and Sentry capture are stubbed per device. Nothing
 * here touches production: the project id is demo-*.
 */
import { vi } from 'vitest'

import { initializeApp as initWebApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, terminate, type Firestore } from 'firebase/firestore'

import { applyOps, REFUSAL_STATUS, type OpsRequest } from '@/lib/setlist-ops'
import type { LocalTrack, SetlistIntent } from '@/lib/local/types'

export const PROJECT_ID = 'demo-sync-repro'

type SchemaMod = typeof import('@/lib/local/schema')
type ListenerMod = typeof import('@/lib/sync/snapshot-listener')
type ActionsMod = typeof import('@/lib/setlist-ops-client/actions')
type RuntimeMod = typeof import('@/lib/setlist-ops-client/runtime')
type ViewMod = typeof import('@/lib/setlist-ops-client/view')
type FreshnessMod = typeof import('@/lib/setlist-ops-client/freshness')

export interface Device {
    name: string
    uid: string
    fs: Firestore
    db: ReturnType<SchemaMod['getDb']>
    actions: ActionsMod
    runtime: RuntimeMod
    listenerWarnings: Array<{ msg: string; err: string }>
    sentry: Array<Record<string, unknown>>
    /** Every order sequence this device's VIEW showed, in time order. */
    seenOrders: string[]
    /** Wire batches this device sent, in order. */
    sent: OpsRequest[]
    boot(): Promise<void>
    startListener(setlistId: string): void
    stopListener(): void
    pause(): void
    resume(): void
    idle(): Promise<void>
    shutdown(): Promise<void>
    /** What the editor shows: server cache + pending intents. */
    view(setlistId: string): Promise<LocalTrack[]>
    /** The server cache alone. */
    cache(setlistId: string): Promise<LocalTrack[]>
    intents(setlistId?: string): Promise<SetlistIntent[]>
    freshness(setlistId: string): Promise<ReturnType<FreshnessMod['computeFreshness']>>
}

let adminDbP: Promise<import('firebase-admin/firestore').Firestore> | null = null

export async function adminDb(): Promise<import('firebase-admin/firestore').Firestore> {
    if (!adminDbP) {
        adminDbP = (async () => {
            const { initializeApp, getApps } = await import('firebase-admin/app')
            const { getFirestore } = await import('firebase-admin/firestore')
            if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp({ projectId: PROJECT_ID })
            return getFirestore()
        })()
    }
    return adminDbP
}

/** Canonical order: order, then id. */
export function gridSort<T extends { order: number; id: string }>(rows: T[]): T[] {
    return rows.slice().sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
}

let deviceSeq = 0

export async function makeDevice(name: string, uid: string, claims: Record<string, unknown>): Promise<Device> {
    const tag = `${name}-${++deviceSeq}`
    const { getAuth: getAdminAuth } = await import('firebase-admin/auth')
    const admin = await adminDb()
    const token = await getAdminAuth().createCustomToken(uid, claims)

    const app: FirebaseApp = initWebApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' }, tag)
    const fs = initializeFirestore(app, {})
    const [h, p] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
    connectFirestoreEmulator(fs, h, Number.parseInt(p, 10))
    const auth = getAuth(app)
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
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
    vi.doMock('@/lib/sync/sentry-capture', () => ({
        captureSyncFailure: (err: unknown, ctx: Record<string, unknown>) => {
            sentry.push({ ...ctx, error: err instanceof Error ? err.message : String(err) })
        },
    }))

    const schema = (await import('@/lib/local/schema')) as SchemaMod
    const listener = (await import('@/lib/sync/snapshot-listener')) as ListenerMod
    const runtime = (await import('@/lib/setlist-ops-client/runtime')) as RuntimeMod
    const actions = (await import('@/lib/setlist-ops-client/actions')) as ActionsMod
    const viewMod = (await import('@/lib/setlist-ops-client/view')) as ViewMod
    const fresh = (await import('@/lib/setlist-ops-client/freshness')) as FreshnessMod
    const db = schema.getDb()

    let gate: Promise<void> | null = null
    let release: () => void = () => {}
    const sent: OpsRequest[] = []
    runtime.configureOpsClient({
        db,
        transport: async (setlistId, body) => {
            if (gate) await gate
            sent.push(body as OpsRequest)
            const r = await applyOps(admin, uid, setlistId, body as OpsRequest)
            return { status: r.ok ? 200 : REFUSAL_STATUS[r.reason], json: r }
        },
    })

    const seenOrders: string[] = []
    let stop: (() => void) | null = null
    let poll: ReturnType<typeof setInterval> | null = null

    const cache = async (setlistId: string) =>
        gridSort((await db.tracks.where('setlistId').equals(setlistId).toArray()) as LocalTrack[])
    const intents = async (setlistId?: string) =>
        (setlistId ? await db.intents.where('setlistId').equals(setlistId).toArray() : await db.intents.toArray()) as SetlistIntent[]
    const view = async (setlistId: string) =>
        viewMod.computeView(await cache(setlistId), await db.setlists.get(setlistId), await intents(setlistId)).rows

    const device: Device = {
        name,
        uid,
        fs,
        db,
        actions,
        runtime,
        listenerWarnings,
        sentry,
        seenOrders,
        sent,
        boot: () => runtime.bootSetlistOps(),
        startListener(setlistId: string) {
            stop = listener.startSnapshotListener({
                setlistId,
                db,
                logger: {
                    warn: (msg: string, err?: unknown) =>
                        listenerWarnings.push({ msg, err: String((err as { code?: string })?.code ?? err) }),
                    error: (msg: string, err?: unknown) =>
                        listenerWarnings.push({ msg, err: String((err as { code?: string })?.code ?? err) }),
                },
            })
            // Sample what the editor would render (15 ms catches each delivery).
            poll = setInterval(() => {
                void view(setlistId).then((r) => {
                    const sig = r.map((x) => x.id).join(',')
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
        pause() {
            gate = new Promise<void>((r) => (release = r))
        },
        resume() {
            gate = null
            release()
        },
        // Nothing pending or in flight (a kick may not have started its drain yet).
        async idle() {
            const end = Date.now() + 15_000
            for (;;) {
                await runtime.getOpsClient().idle()
                const busy = (await db.intents.toArray()).some((i) => i.status !== 'refused')
                if (!busy || Date.now() > end) return
                await new Promise((r) => setTimeout(r, 25))
            }
        },
        async shutdown() {
            device.stopListener()
            device.resume()
            try {
                await terminate(fs)
                await deleteApp(app)
            } catch {
                // best effort
            }
            db.close()
        },
        view,
        cache,
        intents,
        freshness: async (setlistId) =>
            fresh.computeFreshness(await intents(setlistId), { online: true, offlineSince: null }),
    }
    return device
}

/** Seed memberships the op engine authorizes against (the route's bar). */
export async function seedMembers(members: Array<{ uid: string; org: string; role: string }>): Promise<void> {
    const db = await adminDb()
    await Promise.all(
        members.map((m) => db.collection('memberships').doc(`${m.org}__${m.uid}`).set({ uid: m.uid, tenantId: m.org, role: m.role })),
    )
}

/** Seed a setlist + `n` tracks through the Admin SDK, stamped like production rows. */
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
            bpm: 100 + i,
            version: 1,
            updatedAt: FieldValue.serverTimestamp(),
        })
    }
    await batch.commit()
}

/** The server's rows, canonical order. */
export async function serverRows(setlistId: string): Promise<Array<LocalTrack & Record<string, unknown>>> {
    const db = await adminDb()
    const snap = await db.collection('tracks').where('setlistId', '==', setlistId).get()
    return gridSort(
        snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>
            return { ...data, id: d.id, setlistId, order: typeof data.order === 'number' ? data.order : 0 } as LocalTrack &
                Record<string, unknown>
        }),
    )
}

export async function waitFor(cond: () => Promise<boolean> | boolean, timeoutMs = 8000, stepMs = 50): Promise<boolean> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
        if (await cond()) return true
        await new Promise((r) => setTimeout(r, stepMs))
    }
    return false
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** dnd-kit drag of `activeId` onto `overId`, as the editor sends it: ONE move. */
export async function dragRow(dev: Device, setlistId: string, activeId: string, overId: string): Promise<boolean> {
    return dev.actions.moveRow(setlistId, await dev.view(setlistId), activeId, overId)
}

/** Add-at-end, as the editor's add bar sends it. */
export async function addRowAtEnd(dev: Device, setlistId: string, title: string): Promise<string> {
    const v = await dev.view(setlistId)
    const ids = await dev.actions.insertRows(setlistId, v, v.length, [{ title, type: 'song' }])
    return ids![0]
}

/** A field edit, as the cells commit it (a cleared field is `undefined`). */
export async function editField(dev: Device, setlistId: string, rowId: string, patch: Record<string, unknown>): Promise<void> {
    const row = (await dev.view(setlistId)).find((r) => r.id === rowId)!
    await dev.actions.editRow(setlistId, row, patch)
}

export function isPermutation(orders: number[]): boolean {
    return orders
        .slice()
        .sort((a, b) => a - b)
        .every((o, i) => o === i)
}

/** id@order, ids shortened. Compares sequences, not the stored numbers' history. */
export function summarize(rows: Array<{ id: string; order: number }>): string {
    return rows.map((r) => `${r.id.replace(/^.*-/, '')}@${r.order}`).join(' ')
}

/** The sequence of ids alone. */
export const seq = (rows: Array<{ id: string }>) => rows.map((r) => r.id.replace(/^.*-/, '')).join(' ')
