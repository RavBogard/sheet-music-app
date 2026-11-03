/**
 * The server cache: Dexie `tracks` and `setlists` hold SERVER state only.
 * Exactly two writers feed it, both through this file:
 *   (a) the snapshot listener (src/lib/sync/snapshot-listener.ts), which
 *       hands over each non-cache tracks snapshot as the FULL set for the
 *       setlist (`replaceServerRows`), and the setlist doc (`putServerSetlist`);
 *   (b) /ops responses (`applyOpsRows`, `applySetlistEdit`).
 * Local edits never land here: they live in the intent queue and are drawn
 * over this cache by the view (view.ts).
 *
 * The two writers can arrive out of order (a snapshot taken just before the
 * write lands after the response). Each row carries the server's `version`,
 * and a write never lowers it. A row an /ops response just wrote or removed
 * is protected for a short window from a full set that does not know about
 * it yet; the next snapshot settles it either way.
 */
import type { LocalDb } from '@/lib/local/schema'
import type { LocalSetlist, LocalTrack } from '@/lib/local/types'

/** How long an /ops write outranks a full set that disagrees with it. */
export const RECENT_OPS_MS = 10_000

const recentWrites = new Map<string, number>() // rowId -> ms
const recentRemoves = new Map<string, number>()

function recent(map: Map<string, number>, id: string, now: number): boolean {
    const at = map.get(id)
    if (at === undefined) return false
    if (now - at > RECENT_OPS_MS) {
        map.delete(id)
        return false
    }
    return true
}

/** Did an /ops answer in this tab write / remove this row a moment ago? */
export const recentlyWrittenByOps = (id: string, now = Date.now()) => recent(recentWrites, id, now)
export const recentlyRemovedByOps = (id: string, now = Date.now()) => recent(recentRemoves, id, now)

/** Test helper. */
export function _resetServerCacheMemory(): void {
    recentWrites.clear()
    recentRemoves.clear()
}

function toMs(v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
        const t = Date.parse(v)
        return Number.isNaN(t) ? 0 : t
    }
    const ts = v as { toMillis?: () => number; seconds?: number } | null
    if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
    if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000
    return 0
}

function versionOf(r: unknown): number {
    const v = (r as { version?: unknown } | undefined)?.version
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** One server row as the cache stores it. */
export function toLocalTrack(setlistId: string, id: string, data: Record<string, unknown>): LocalTrack {
    return {
        ...data,
        id,
        setlistId,
        order: typeof data.order === 'number' ? data.order : 0,
        updatedAt: toMs(data.updatedAt),
    } as LocalTrack
}

export interface ServerRow {
    id: string
    data: Record<string, unknown>
}

/**
 * A full server set for one setlist (a live, non-cache snapshot). Replaces
 * the cache's rows for that setlist: newer rows are put, rows the server no
 * longer has are deleted (ghosts), and an older row never overwrites a newer
 * one. Returns what changed, for the edit log.
 */
export async function replaceServerRows(
    db: LocalDb,
    setlistId: string,
    rows: readonly ServerRow[],
    now = Date.now(),
): Promise<{ put: number; pruned: number; kept: number }> {
    let put = 0
    let pruned = 0
    let kept = 0
    await db.transaction('rw', db.tracks, async () => {
        const local = await db.tracks.where('setlistId').equals(setlistId).toArray()
        const localById = new Map(local.map((r) => [r.id, r]))
        const incoming = new Set<string>()
        const toPut: LocalTrack[] = []
        for (const r of rows) {
            incoming.add(r.id)
            if (recent(recentRemoves, r.id, now)) {
                kept++
                continue
            }
            const next = toLocalTrack(setlistId, r.id, r.data)
            const cur = localById.get(r.id)
            if (cur && versionOf(cur) > versionOf(next)) {
                kept++
                continue
            }
            toPut.push(next)
        }
        const toDelete = local
            .filter((r) => !incoming.has(r.id) && !recent(recentWrites, r.id, now))
            .map((r) => r.id)
        if (toPut.length) await db.tracks.bulkPut(toPut)
        if (toDelete.length) await db.tracks.bulkDelete(toDelete)
        put = toPut.length
        pruned = toDelete.length
    })
    return { put, pruned, kept }
}

/** Rows and removals from an /ops response. */
export async function applyOpsRows(
    db: LocalDb,
    setlistId: string,
    rows: ReadonlyArray<Record<string, unknown> & { id: string }>,
    removed: readonly string[],
    now = Date.now(),
): Promise<void> {
    await db.transaction('rw', db.tracks, async () => {
        for (const r of rows) {
            const next = toLocalTrack(setlistId, r.id, r)
            const cur = await db.tracks.get(r.id)
            recentWrites.set(r.id, now)
            recentRemoves.delete(r.id)
            if (cur && versionOf(cur) > versionOf(next)) continue
            await db.tracks.put(next)
        }
        for (const id of removed) {
            recentRemoves.set(id, now)
            recentWrites.delete(id)
            await db.tracks.delete(id)
        }
    })
}

/** The setlist doc from the listener. Never lowers the cached `version`. */
export async function putServerSetlist(
    db: LocalDb,
    setlistId: string,
    data: Record<string, unknown>,
): Promise<boolean> {
    let wrote = false
    await db.transaction('rw', db.setlists, async () => {
        const cur = await db.setlists.get(setlistId)
        if (cur && versionOf(cur) > versionOf(data)) return
        await db.setlists.put({ ...data, id: setlistId, updatedAt: toMs(data.updatedAt) } as LocalSetlist)
        wrote = true
    })
    return wrote
}

/**
 * The fields an editSetlist op applied, as the server now holds them, plus
 * the new `version`. The response carries no setlist doc, so without this the
 * edit would blink back to the old value until the listener catches up.
 */
export async function applySetlistEdit(
    db: LocalDb,
    setlistId: string,
    applied: Record<string, unknown>,
    version: number,
): Promise<void> {
    await db.transaction('rw', db.setlists, async () => {
        const cur = await db.setlists.get(setlistId)
        if (!cur) return
        if (versionOf(cur) > version) return
        const next: Record<string, unknown> = { ...cur, version }
        for (const [k, v] of Object.entries(applied)) {
            if (v === null) delete next[k]
            else next[k] = v
        }
        await db.setlists.put(next as LocalSetlist)
    })
}

/** Record the version an /ops response reported (for `baseVersion`). */
export async function noteSetlistVersion(db: LocalDb, setlistId: string, version: number): Promise<void> {
    await db.transaction('rw', db.setlists, async () => {
        const cur = await db.setlists.get(setlistId)
        if (!cur || versionOf(cur) >= version) return
        await db.setlists.put({ ...cur, version } as LocalSetlist)
    })
}
