/**
 * The page-wide ops client: one per tab, built on first use with the real
 * transport (/api/setlists/{id}/ops through apiFetch) and the real server
 * reader (public `get`s of one setlist or row). Tests swap both in with
 * `configureOpsClient`.
 */
import { getDb } from '@/lib/local/schema'
import { logger } from '@/lib/logger'

import { SetlistOpsClient, type OpsClientDeps, type OpsTransport, type ServerReader } from './client'
import { installConnectivityListeners } from './connectivity'
import { migrateOutbox } from './migrate'

const productionTransport: OpsTransport = async (setlistId, body) => {
    const { apiFetch } = await import('@/lib/api-client')
    const res = await apiFetch(`/api/setlists/${encodeURIComponent(setlistId)}/ops`, {
        method: 'POST',
        body: JSON.stringify(body),
    })
    let json: unknown = null
    try {
        json = await res.json()
    } catch {
        json = null
    }
    return { status: res.status, json }
}

async function readDoc(collection: 'tracks' | 'setlists', id: string): Promise<Record<string, unknown> | null> {
    const [{ getDb: getFirestore }, { doc, getDoc }] = await Promise.all([import('@/lib/firebase'), import('firebase/firestore')])
    const snap = await getDoc(doc(await getFirestore(), collection, id))
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null
}

const productionReader: ServerReader = {
    readRow: (rowId) => readDoc('tracks', rowId),
    readSetlist: (setlistId) => readDoc('setlists', setlistId),
}

let client: SetlistOpsClient | null = null
let deps: Omit<OpsClientDeps, 'db'> & { db?: OpsClientDeps['db'] } = {
    transport: productionTransport,
    reader: productionReader,
}
let booted: Promise<void> | null = null

export function getOpsClient(): SetlistOpsClient {
    if (!client) client = new SetlistOpsClient({ ...deps, db: deps.db ?? (() => getDb()) })
    return client
}

/**
 * Start the client once per tab: listen for the network, re-send any batch a
 * reload interrupted, convert the old outbox (migrate.ts), then drain.
 */
export function bootSetlistOps(): Promise<void> {
    if (booted) return booted
    booted = (async () => {
        const c = getOpsClient()
        installConnectivityListeners(() => c.kick())
        try {
            await c.recoverInFlight()
        } catch (err) {
            logger.warn('[setlist-ops] could not recover in-flight intents', err)
        }
        try {
            const src = deps.db
            const db = typeof src === 'function' ? src() : (src ?? getDb())
            const report = await migrateOutbox(db, deps.reader)
            if (report.converted > 0) logger.info?.('[setlist-ops] converted the old outbox', report)
        } catch (err) {
            logger.error('[setlist-ops] old outbox conversion failed; it will be tried again next load', err)
        }
        c.kick()
    })()
    return booted
}

/** The snapshot listener waits for this before it may prune the cache. */
export function whenMigrated(): Promise<void> {
    if (typeof window === 'undefined' && !deps.db) return Promise.resolve()
    return bootSetlistOps()
}

/** Tests: use these deps (and a fresh client) from now on. */
export function configureOpsClient(next: Partial<OpsClientDeps>): SetlistOpsClient {
    deps = { ...deps, ...next }
    client = null
    booted = null
    return getOpsClient()
}
