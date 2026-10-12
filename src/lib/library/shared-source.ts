/**
 * Multi-tenant phase 5 — where the browser reads shared collections from.
 *
 * Three reads, all fail-soft (an error or a refused query is "nothing shared",
 * so a tenant with no sharing configured, or rules not yet deployed, sees
 * exactly what it saw before):
 *
 *   collections where sharedWith  array-contains T   (records T may see)
 *   collections where assignedTo  array-contains T
 *   library_index where visibleToOrgs array-contains T, where orgId != T
 *
 * The shared rows are cached once per tenant and user for the session and
 * refreshed when the library signal fires. They are also written into the
 * local Dexie `songs` table, like own rows, so the picker works offline and
 * stale shared rows (unshared since) are dropped.
 */
import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore'

import { getDb as getFirestoreDb } from '@/lib/firebase'
import { normalizeCollection } from '@/lib/library/collections'
import { sharedTitle, type SharedCollection, type SharedFile } from '@/lib/library/shared-collections'
import { collectionIdOf, isOwnedBy, visibleTo } from '@/lib/library/visibility'
import { getDb, type LocalDb } from '@/lib/local/schema'
import type { LocalSong } from '@/lib/local/types'
import { logger } from '@/lib/logger'
import type { OrgId } from '@/lib/org/types'

export interface SharedSource {
    listCollections(org: OrgId): Promise<SharedCollection[]>
    listSharedRows(org: OrgId): Promise<SharedFile[]>
    ownerName(orgId: string): Promise<string | null>
}

function strings(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function toSharedCollection(id: string, d: Record<string, unknown>): SharedCollection | null {
    const ownerOrgId = typeof d.ownerOrgId === 'string' ? d.ownerOrgId : ''
    if (!ownerOrgId) return null
    const name = typeof d.name === 'string' && d.name ? d.name : id.split('__').slice(1).join('__') || id
    const label = typeof d.label === 'string' && d.label ? d.label : name
    return { id, ownerOrgId, name, label }
}

/** library_index doc → the DriveFile shape the library surfaces use. */
export function toSharedFile(id: string, d: Record<string, unknown>): SharedFile | null {
    const orgId = typeof d.orgId === 'string' ? d.orgId : ''
    const name = typeof d.name === 'string' ? d.name : ''
    if (!orgId || !name) return null
    const base = {
        id,
        name,
        ...(typeof d.displayName === 'string' && d.displayName ? { displayName: d.displayName } : {}),
        mimeType: typeof d.mimeType === 'string' ? d.mimeType : 'application/pdf',
        collection: normalizeCollection(d.collection),
        ...(d.metadata && typeof d.metadata === 'object' ? { metadata: d.metadata as SharedFile['metadata'] } : {}),
        orgId,
        visibleToOrgs: strings(d.visibleToOrgs),
        status: typeof d.status === 'string' ? d.status : 'active',
    }
    return { ...base, collectionId: collectionIdOf({ ...base, collectionId: d.collectionId }) }
}

const firestoreSource: SharedSource = {
    async listCollections(org) {
        const db: Firestore = await getFirestoreDb()
        const out: SharedCollection[] = []
        for (const field of ['sharedWith', 'assignedTo'] as const) {
            try {
                const snap = await getDocs(query(collection(db, 'collections'), where(field, 'array-contains', org)))
                for (const d of snap.docs) {
                    const rec = toSharedCollection(d.id, d.data())
                    if (rec) out.push(rec)
                }
            } catch (err) {
                logger.warn(`[shared-source] collections ${field} read failed`, err)
            }
        }
        return out
    },
    async listSharedRows(org) {
        const db: Firestore = await getFirestoreDb()
        const snap = await getDocs(
            query(
                collection(db, 'library_index'),
                where('visibleToOrgs', 'array-contains', org),
                where('orgId', '!=', org),
            ),
        )
        const out: SharedFile[] = []
        for (const d of snap.docs) {
            const row = toSharedFile(d.id, d.data())
            if (row) out.push(row)
        }
        return out
    },
    async ownerName(orgId) {
        const db: Firestore = await getFirestoreDb()
        const snap = await getDoc(doc(db, 'orgs', orgId))
        const d = snap.data() as { name?: unknown; branding?: { shortName?: unknown } } | undefined
        const short = d?.branding?.shortName
        if (typeof short === 'string' && short) return short
        return typeof d?.name === 'string' && d.name ? d.name : null
    },
}

let source: SharedSource = firestoreSource

/** Tests inject an in-memory source; null restores Firestore. Also clears the cache. */
export function setSharedSourceForTests(next: SharedSource | null): void {
    source = next ?? firestoreSource
    invalidateSharedCache()
}

export interface SharedRowsResult {
    rows: SharedFile[]
    /** True when the shared rows could not be read (offline, refused). */
    failed: boolean
}

const collectionsCache = new Map<string, Promise<SharedCollection[]>>()
const rowsCache = new Map<string, Promise<SharedRowsResult>>()
const ownerCache = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

/** Drop the session cache (library signal, tests) and tell readers. */
export function invalidateSharedCache(): void {
    // Several mounted readers hear the same library signal; refetch once.
    if (collectionsCache.size + rowsCache.size + ownerCache.size === 0) return
    collectionsCache.clear()
    rowsCache.clear()
    ownerCache.clear()
    for (const l of listeners) l()
}

export function onSharedCacheInvalidated(l: () => void): () => void {
    listeners.add(l)
    return () => {
        listeners.delete(l)
    }
}

/** The shared collection records this tenant can see, once per session. Never rejects. */
export function loadSharedCollections(org: OrgId, uid: string | null | undefined): Promise<SharedCollection[]> {
    const key = `${org}|${uid ?? ''}`
    let p = collectionsCache.get(key)
    if (!p) {
        p = source.listCollections(org).catch((err) => {
            logger.warn('[shared-source] collections read failed', err)
            return [] as SharedCollection[]
        })
        collectionsCache.set(key, p)
    }
    return p
}

/**
 * Every row shared with this tenant (one query), once per session, written to
 * the local songs table. Read only when a chip is on or a section needs it.
 * Never rejects.
 */
export function loadSharedRows(
    org: OrgId,
    uid: string | null | undefined,
    localDb?: LocalDb,
): Promise<SharedRowsResult> {
    const key = `${org}|${uid ?? ''}`
    let p = rowsCache.get(key)
    if (!p) {
        p = (async (): Promise<SharedRowsResult> => {
            try {
                const rows = (await source.listSharedRows(org)).filter((r) => !isOwnedBy(r, org) && visibleTo(r, org))
                await cacheSharedSongs(rows, org, localDb).catch((err) => {
                    logger.warn('[shared-source] local cache write failed', err)
                })
                return { rows, failed: false }
            } catch (err) {
                logger.warn('[shared-source] shared rows read failed', err)
                // Not cached: the next reader tries again (e.g. back online).
                rowsCache.delete(key)
                return { rows: [], failed: true }
            }
        })()
        rowsCache.set(key, p)
    }
    return p
}

/** The owner's display name from `orgs/{id}`, once per session; null when unknown. */
export function loadOwnerName(orgId: string): Promise<string | null> {
    let p = ownerCache.get(orgId)
    if (!p) {
        p = source.ownerName(orgId).catch(() => null)
        ownerCache.set(orgId, p)
    }
    return p
}

/**
 * Write the shared rows into the local songs table like own rows, and drop
 * any shared row this tenant can no longer see (unshared since). Own rows
 * are never touched here.
 */
export async function cacheSharedSongs(rows: SharedFile[], org: OrgId, localDb: LocalDb = getDb()): Promise<void> {
    const fresh = new Set(rows.map((r) => r.id))
    const stale = await localDb.songs
        .filter((s) => !isOwnedBy(s, org) && !fresh.has(s.id))
        .primaryKeys()
    if (stale.length) await localDb.songs.bulkDelete(stale)
    if (rows.length === 0) return
    const existing = await localDb.songs.bulkGet(rows.map((r) => r.id))
    await localDb.songs.bulkPut(
        rows.map((r, i) => {
            const title = sharedTitle(r)
            const prior = existing[i]
            return {
                // Keep anything the local table already knew (defaults, recent).
                ...(prior ?? {}),
                id: r.id,
                title,
                normalizedTitle: title.toLowerCase(),
                orgId: r.orgId,
                visibleToOrgs: r.visibleToOrgs,
                collection: r.collection,
                collectionId: r.collectionId,
                status: r.status as LocalSong['status'],
            } as LocalSong
        }),
    )
}
