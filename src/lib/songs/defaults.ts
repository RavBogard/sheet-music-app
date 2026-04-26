// Sticky song memory helpers (v50-04).
// Bound by ARCHITECTURE.md §4. Pure data-layer module — no UI imports.
// v50-05 (editor cutover) consumes both helpers from here.

import { getDb } from '../local/schema'
import type { SongDefaults, SongRecentEntry } from '../local/types'
import { applyEdit } from '../local/write'

export type TrackDefaults = SongDefaults

export interface PropagationClock {
    now(): number
    setTimeout(fn: () => void, ms: number): unknown
    clearTimeout(handle: unknown): void
}

const realClock: PropagationClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

const DEBOUNCE_MS_DEFAULT = 1000
const RECENT_CAP = 5

interface PendingEntry {
    timer: unknown
    pendingPatch: TrackDefaults
    pendingSetlistId: string
    clock: PropagationClock
    inFlight?: Promise<void>
}

const pending = new Map<string, PendingEntry>()

export async function seedTrackFromSong(
    songId: string,
): Promise<TrackDefaults> {
    try {
        const row = await getDb().songs.get(songId)
        const d = row?.defaults
        if (!d) return {}
        const out: TrackDefaults = {}
        if (typeof d.key === 'string') out.key = d.key
        if (typeof d.lead === 'string') out.lead = d.lead
        if (typeof d.bpm === 'number') out.bpm = d.bpm
        return out
    } catch {
        return {}
    }
}

function mergePatch(
    target: TrackDefaults,
    incoming: TrackDefaults,
): TrackDefaults {
    const out: TrackDefaults = { ...target }
    if (incoming.key !== undefined) out.key = incoming.key
    if (incoming.lead !== undefined) out.lead = incoming.lead
    if (incoming.bpm !== undefined) out.bpm = incoming.bpm
    return out
}

async function flushOne(songId: string): Promise<void> {
    const entry = pending.get(songId)
    if (!entry) return
    pending.delete(songId)

    const { pendingPatch, pendingSetlistId, clock } = entry
    const existing = await getDb().songs.get(songId)
    const mergedDefaults: SongDefaults = {
        ...(existing?.defaults ?? {}),
        ...(pendingPatch.key !== undefined ? { key: pendingPatch.key } : {}),
        ...(pendingPatch.lead !== undefined ? { lead: pendingPatch.lead } : {}),
        ...(pendingPatch.bpm !== undefined ? { bpm: pendingPatch.bpm } : {}),
    }
    const newRecentEntry: SongRecentEntry = {
        ...(pendingPatch.key !== undefined ? { key: pendingPatch.key } : {}),
        ...(pendingPatch.lead !== undefined ? { lead: pendingPatch.lead } : {}),
        ...(pendingPatch.bpm !== undefined ? { bpm: pendingPatch.bpm } : {}),
        setlistId: pendingSetlistId,
        performedAt: clock.now(),
    }
    const newRecent = [newRecentEntry, ...(existing?.recent ?? [])].slice(
        0,
        RECENT_CAP,
    )

    await applyEdit({
        op: 'update',
        collection: 'songs',
        docId: songId,
        patch: { defaults: mergedDefaults, recent: newRecent },
    })
}

export function propagateTrackEditToSong(
    songId: string,
    patch: TrackDefaults,
    setlistId: string,
    opts: { clock?: PropagationClock; debounceMs?: number } = {},
): void {
    const clock = opts.clock ?? realClock
    const debounceMs = opts.debounceMs ?? DEBOUNCE_MS_DEFAULT

    const existing = pending.get(songId)
    if (existing) {
        clock.clearTimeout(existing.timer)
    }

    const mergedPatch = mergePatch(existing?.pendingPatch ?? {}, patch)
    const entry: PendingEntry = {
        timer: null,
        pendingPatch: mergedPatch,
        pendingSetlistId: setlistId,
        clock,
    }
    entry.timer = clock.setTimeout(() => {
        entry.inFlight = flushOne(songId)
    }, debounceMs)
    pending.set(songId, entry)
}

export async function flushPendingPropagations(): Promise<void> {
    const ids = [...pending.keys()]
    const promises: Array<Promise<void>> = []
    for (const id of ids) {
        const entry = pending.get(id)
        if (!entry) continue
        entry.clock.clearTimeout(entry.timer)
        promises.push(flushOne(id))
    }
    await Promise.all(promises)
}

export function __resetForTests(): void {
    for (const entry of pending.values()) {
        entry.clock.clearTimeout(entry.timer)
    }
    pending.clear()
}
