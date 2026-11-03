/**
 * Perform's read model (setlist sync PR 4). Dexie is a cache of the server's
 * rows. Two things keep a band iPad's cache honest without ever alerting
 * anyone mid-service:
 *
 *   1. SEED: when the server render this page came with carries a newer setlist
 *      `version` than the cache, the render's rows replace the cache.
 *   2. SELF-CHECK: on focus, visibility and reconnect the page asks the server
 *      for the setlist's `version`; if the cache has fallen behind it refetches
 *      the full set and replaces the cache. Silent. A failed check does nothing.
 *
 * The decisions are pure so they are tested without a browser.
 */
import type { LocalDb } from '@/lib/local/schema'
import { quietFor } from './quiet'
import { noteSetlistVersion, replaceServerRows, type ServerRow } from '@/lib/setlist-ops-client/server-cache'

/**
 * The version this tab last cached per setlist. A signed-out device has no
 * cached setlist doc to hold it, and would otherwise heal on every focus.
 */
const lastKnown = new Map<string, number>()
export const _resetReadModelMemory = () => lastKnown.clear()
const known = (setlistId: string, cached: unknown) => Math.max(num(cached), lastKnown.get(setlistId) ?? 0)
const remember = (setlistId: string, v: unknown) => {
    if (typeof v === 'number') lastKnown.set(setlistId, Math.max(v, lastKnown.get(setlistId) ?? 0))
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Seed only when the render is strictly newer than the cache (or the cache has no setlist). */
export function decideSeed(ssrVersion: unknown, cachedVersion: unknown, cachedPresent: boolean): 'seed' | 'keep' {
    if (!cachedPresent) return 'seed'
    return num(ssrVersion) > num(cachedVersion) ? 'seed' : 'keep'
}

/** Heal only when the server is strictly ahead of what this device holds. */
export function decideHeal(localVersion: unknown, serverVersion: unknown): 'heal' | 'ok' {
    return num(serverVersion) > num(localVersion) ? 'heal' : 'ok'
}

interface RowLike {
    id?: string
}

const toServerRows = (rows: readonly RowLike[]): ServerRow[] =>
    rows.filter((r): r is RowLike & { id: string } => !!r.id).map((r) => ({ id: r.id, data: r as unknown as Record<string, unknown> }))

/** Seed the cache from the server render when it is newer. Returns whether it seeded. */
export async function seedCacheFromSsr(
    db: LocalDb,
    setlistId: string,
    ssr: { version?: unknown; rows: readonly RowLike[] } | null,
): Promise<boolean> {
    if (!ssr || ssr.rows.length === 0) return false
    const cachedRows = await db.tracks.where('setlistId').equals(setlistId).count()
    if (cachedRows > 0) {
        // A cache that holds rows is only replaced by a render that proves it is newer.
        if (typeof ssr.version !== 'number') return false
        const cached = await db.setlists.get(setlistId)
        const cachedVersion = known(setlistId, (cached as { version?: unknown } | undefined)?.version)
        if (decideSeed(ssr.version, cachedVersion, true) === 'keep') return false
    }
    // Re-checked inside the replace's own transaction: a live snapshot may have
    // landed while we were reading.
    quietFor(setlistId)
    const res = await replaceServerRows(
        db,
        setlistId,
        toServerRows(ssr.rows),
        Date.now(),
        cachedRows > 0 && typeof ssr.version === 'number' ? { version: ssr.version } : undefined,
    )
    if (res.skipped) return false
    quietFor(setlistId)
    remember(setlistId, ssr.version)
    if (typeof ssr.version === 'number') await noteSetlistVersion(db, setlistId, ssr.version)
    return true
}

export type FetchServerSet = (setlistId: string) => Promise<{ version: number; rows: RowLike[] } | null>

/** Production reader: the public per-setlist endpoint (rows plus the setlist version). */
export const fetchServerSet: FetchServerSet = async (setlistId) => {
    try {
        const res = await fetch(`/api/setlists/${encodeURIComponent(setlistId)}/tracks`, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
        })
        if (!res.ok) return null
        const body = (await res.json()) as { found?: boolean; version?: unknown; tracks?: RowLike[] }
        if (!Array.isArray(body.tracks) || typeof body.version !== 'number') return null
        return { version: body.version, rows: body.tracks }
    } catch {
        return null
    }
}

/**
 * Compare the cache with the server and, if it has drifted, replace it.
 * Never throws and never reports: a device that cannot reach the server keeps
 * what it has. Returns true when it healed.
 */
export async function selfCheckAndHeal(
    db: LocalDb,
    setlistId: string,
    fetchSet: FetchServerSet = fetchServerSet,
): Promise<boolean> {
    try {
        const cached = await db.setlists.get(setlistId)
        const set = await fetchSet(setlistId)
        if (!set) return false
        if (decideHeal(known(setlistId, (cached as { version?: unknown } | undefined)?.version), set.version) === 'ok' && (cached || lastKnown.has(setlistId))) return false
        // The cache may have moved on while the fetch was in flight (a live
        // snapshot, an /ops answer): the transaction re-reads its version and
        // replaces nothing when it is already at or past the fetched one.
        quietFor(setlistId)
        const res = await replaceServerRows(db, setlistId, toServerRows(set.rows), Date.now(), { version: set.version })
        if (res.skipped) return false
        quietFor(setlistId)
        remember(setlistId, set.version)
        await noteSetlistVersion(db, setlistId, set.version)
        return true
    } catch {
        return false
    }
}

/** A live (non-cache) rows snapshot arrived this recently: the listener is doing the job, skip the focus fetch. */
export const LIVE_FRESH_MS = 60_000
export function shouldSkipHeal(lastLiveRowsAt: number, now = Date.now()): boolean {
    return lastLiveRowsAt > 0 && now - lastLiveRowsAt < LIVE_FRESH_MS
}
