import { beforeEach, describe, expect, it } from 'vitest'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from '../migrate-v50'
import {
    runBackfill,
    classifyAction,
    computeDenormFields,
    BACKFILL_LIMIT,
} from '../backfill-tracks-v60'

// -------------------------------------------------------------------------
// In-memory MigrationFirestore fake — ported from bootstrap-songs.test.ts
// -------------------------------------------------------------------------

interface RecordedOp {
    kind: 'set' | 'update' | 'delete'
    path: string
}

class FakeFirestore implements MigrationFirestore {
    docs = new Map<string, Record<string, unknown>>()
    writes = { set: 0, update: 0, delete: 0 }
    ops: RecordedOp[] = []

    seed(path: string, data: Record<string, unknown>): void {
        this.docs.set(path, structuredClone(data))
    }

    async getDoc(
        path: string,
    ): Promise<{ exists: boolean; data: Record<string, unknown> | null }> {
        const data = this.docs.get(path)
        return data
            ? { exists: true, data: structuredClone(data) }
            : { exists: false, data: null }
    }

    async listCollection(path: string): Promise<MigrationDoc[]> {
        const out: MigrationDoc[] = []
        const prefix = `${path}/`
        for (const [p, data] of this.docs) {
            if (!p.startsWith(prefix)) continue
            const rest = p.slice(prefix.length)
            if (rest.includes('/')) continue
            out.push({ id: rest, data: structuredClone(data) })
        }
        return out
    }

    async setDoc(path: string, data: Record<string, unknown>): Promise<void> {
        this.writes.set += 1
        this.ops.push({ kind: 'set', path })
        this.docs.set(path, structuredClone(data))
    }

    async updateDoc(
        path: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        this.writes.update += 1
        this.ops.push({ kind: 'update', path })
        const existing = this.docs.get(path) ?? {}
        const merged = { ...existing }
        for (const [k, v] of Object.entries(data)) {
            if (v === FIELD_DELETE_SENTINEL) {
                delete merged[k]
            } else {
                merged[k] = v
            }
        }
        this.docs.set(path, merged)
    }

    async deleteDoc(path: string): Promise<void> {
        this.writes.delete += 1
        this.ops.push({ kind: 'delete', path })
        this.docs.delete(path)
    }
}

function logs(): { log: (msg: string) => void; lines: string[] } {
    const lines: string[] = []
    return { log: (m) => lines.push(m), lines }
}

const FIXED_NOW = 1_700_000_000_000

function makeNow(): () => number {
    return () => FIXED_NOW
}

interface TrackOverrides {
    id?: string
    type?: string
    fileId?: string
    order?: number
    [k: string]: unknown
}

function makeTrack(overrides: TrackOverrides = {}): Record<string, unknown> {
    return {
        id: 't-' + Math.random().toString(36).slice(2, 9),
        title: 'Song',
        type: 'song',
        fileId: 'lib1',
        ...overrides,
    }
}

interface SetlistOverrides {
    date?: number
    updatedAt?: number
    tracks?: Record<string, unknown>[]
    hydrated?: boolean
    trackCount?: number
    songCount?: number
    fileIds?: string[]
    [k: string]: unknown
}

function makeSetlist(
    id: string,
    overrides: SetlistOverrides = {},
): Record<string, unknown> {
    return {
        date: FIXED_NOW,
        updatedAt: FIXED_NOW - 1000,
        tracks: [makeTrack()],
        ...overrides,
    }
}

// -------------------------------------------------------------------------
// classifyAction (pure function — AC-2 classification rules)
// -------------------------------------------------------------------------

describe('classifyAction', () => {
    it('returns MIGRATE for unhydrated setlist with embedded tracks', () => {
        expect(
            classifyAction({ tracks: [makeTrack()], hydrated: undefined }),
        ).toBe('MIGRATE')
    })

    it('returns SKIP-HYDRATED for hydrated:true setlist', () => {
        expect(
            classifyAction({ hydrated: true, tracks: [makeTrack()] }),
        ).toBe('SKIP-HYDRATED')
    })

    it('returns SKIP-EMPTY for empty tracks array', () => {
        expect(classifyAction({ tracks: [] })).toBe('SKIP-EMPTY')
    })

    it('returns SKIP-EMPTY for missing tracks field', () => {
        expect(classifyAction({})).toBe('SKIP-EMPTY')
    })
})

// -------------------------------------------------------------------------
// computeDenormFields (pure function — AC-5 4-field shape)
// -------------------------------------------------------------------------

describe('computeDenormFields', () => {
    it('returns zeros + empty array for empty tracks', () => {
        expect(computeDenormFields([])).toEqual({
            trackCount: 0,
            songCount: 0,
            fileIds: [],
        })
    })

    it('counts song-typed and untyped tracks as songs; excludes other types', () => {
        const tracks = [
            { id: '1', type: 'song', fileId: 'a' },
            { id: '2', fileId: 'b' }, // no type — counts as song
            { id: '3', type: 'song', fileId: 'c' },
            { id: '4', type: 'prayer', fileId: 'd' }, // excluded from songCount
        ]
        const { trackCount, songCount } = computeDenormFields(tracks)
        expect(trackCount).toBe(4)
        expect(songCount).toBe(3)
    })

    it('dedups + sorts fileIds; drops empty/non-string', () => {
        const tracks = [
            { id: '1', fileId: 'zebra' },
            { id: '2', fileId: 'alpha' },
            { id: '3', fileId: 'zebra' }, // dup
            { id: '4', fileId: '' }, // empty — drop
            { id: '5' }, // no fileId — drop
            { id: '6', fileId: 'mango' },
        ]
        expect(computeDenormFields(tracks).fileIds).toEqual([
            'alpha',
            'mango',
            'zebra',
        ])
    })
})

// -------------------------------------------------------------------------
// runBackfill — dry-run mode (AC-8)
// -------------------------------------------------------------------------

describe('runBackfill — dry-run mode', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        // Three setlists: MIGRATE, SKIP-HYDRATED, SKIP-EMPTY
        fs.seed(
            'setlists/sl-migrate',
            makeSetlist('sl-migrate', {
                date: FIXED_NOW - 1000,
                tracks: [makeTrack({ id: 't1' }), makeTrack({ id: 't2' })],
            }),
        )
        fs.seed(
            'setlists/sl-hydrated',
            makeSetlist('sl-hydrated', {
                date: FIXED_NOW - 2000,
                hydrated: true,
                tracks: [makeTrack({ id: 't3' })],
            }),
        )
        fs.seed(
            'setlists/sl-empty',
            makeSetlist('sl-empty', {
                date: FIXED_NOW - 3000,
                tracks: [],
            }),
        )
    })

    it('classifies 3 setlists correctly (1 MIGRATE / 1 SKIP-HYDRATED / 1 SKIP-EMPTY)', async () => {
        const { log } = logs()
        const result = await runBackfill(fs, {
            mode: 'dry-run',
            log,
            now: makeNow(),
        })
        expect(result.candidatesEvaluated).toBe(3)
        expect(result.migrated).toBe(1)
        expect(result.skippedHydrated).toBe(1)
        expect(result.skippedEmpty).toBe(1)
    })

    it('writes NOTHING in dry-run mode (no marker, no snapshots, no setlist updates)', async () => {
        const { log } = logs()
        await runBackfill(fs, { mode: 'dry-run', log, now: makeNow() })
        expect(fs.writes.set).toBe(0)
        expect(fs.writes.update).toBe(0)
        expect(fs.writes.delete).toBe(0)
        const marker = await fs.getDoc('system/v60TracksBackfill')
        expect(marker.exists).toBe(false)
    })
})

// -------------------------------------------------------------------------
// runBackfill — apply mode (AC-1..5, AC-7 idempotency)
// -------------------------------------------------------------------------

describe('runBackfill — apply mode', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
    })

    it('caps at BACKFILL_LIMIT (15) most-recent setlists by date DESC; 3 oldest skipped at selection', async () => {
        // Seed 18 candidates with strictly decreasing dates so the 3 oldest
        // are outside the top-15 selection window.
        for (let i = 0; i < 18; i++) {
            fs.seed(
                `setlists/sl-${i}`,
                makeSetlist(`sl-${i}`, {
                    date: FIXED_NOW - i * 1000,
                    tracks: [makeTrack({ id: `t-${i}-0` })],
                }),
            )
        }
        const { log } = logs()
        const result = await runBackfill(fs, {
            mode: 'apply',
            log,
            now: makeNow(),
        })
        expect(result.candidatesEvaluated).toBe(BACKFILL_LIMIT)
        expect(result.candidatesEvaluated).toBe(15)
        expect(result.migrated).toBe(15)
        // Oldest 3 (sl-15, sl-16, sl-17) should NOT appear in migratedIds.
        expect(result.migratedIds).not.toContain('sl-15')
        expect(result.migratedIds).not.toContain('sl-16')
        expect(result.migratedIds).not.toContain('sl-17')
        // Newest (sl-0) MUST appear.
        expect(result.migratedIds).toContain('sl-0')
    })

    it('writes snapshot BEFORE top-level tracks and BEFORE setlist update', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', {
                tracks: [makeTrack({ id: 't1' }), makeTrack({ id: 't2' })],
            }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })

        // Ops for sl1: snapshot set → 2 track sets → 1 setlist update → marker set
        const sl1Ops = fs.ops.filter(
            (op) =>
                op.path === 'migration_snapshots/sl1' ||
                op.path === 'tracks/t1' ||
                op.path === 'tracks/t2' ||
                op.path === 'setlists/sl1',
        )
        const snapshotIdx = sl1Ops.findIndex(
            (op) => op.path === 'migration_snapshots/sl1',
        )
        const trackIdx1 = sl1Ops.findIndex((op) => op.path === 'tracks/t1')
        const trackIdx2 = sl1Ops.findIndex((op) => op.path === 'tracks/t2')
        const setlistIdx = sl1Ops.findIndex(
            (op) => op.path === 'setlists/sl1' && op.kind === 'update',
        )
        expect(snapshotIdx).toBeGreaterThanOrEqual(0)
        expect(snapshotIdx).toBeLessThan(trackIdx1)
        expect(snapshotIdx).toBeLessThan(trackIdx2)
        expect(snapshotIdx).toBeLessThan(setlistIdx)
        expect(trackIdx1).toBeLessThan(setlistIdx)
        expect(trackIdx2).toBeLessThan(setlistIdx)
    })

    it('top-level tracks/{id} docs have correct setlistId / order / updatedAt fields', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', {
                updatedAt: 999999,
                tracks: [
                    makeTrack({ id: 'ta', order: 5 }),
                    makeTrack({ id: 'tb' }), // order missing → falls back to index 1
                ],
            }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })

        const taSnap = await fs.getDoc('tracks/ta')
        expect(taSnap.exists).toBe(true)
        expect(taSnap.data?.setlistId).toBe('sl1')
        expect(taSnap.data?.order).toBe(5) // preserved
        expect(taSnap.data?.updatedAt).toBe(999999) // from setlist.updatedAt

        const tbSnap = await fs.getDoc('tracks/tb')
        expect(tbSnap.data?.setlistId).toBe('sl1')
        expect(tbSnap.data?.order).toBe(1) // index fallback
    })

    it('setlist update writes EXACTLY the 4 denormalization fields', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', {
                tracks: [
                    makeTrack({ id: 't1', fileId: 'a', type: 'song' }),
                    makeTrack({ id: 't2', fileId: 'b', type: 'prayer' }),
                ],
            }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })

        const slSnap = await fs.getDoc('setlists/sl1')
        expect(slSnap.data?.hydrated).toBe(true)
        expect(slSnap.data?.trackCount).toBe(2)
        expect(slSnap.data?.songCount).toBe(1) // only the song-typed
        expect(slSnap.data?.fileIds).toEqual(['a', 'b'])
        // Verify the original fields are preserved (merge semantics).
        expect(slSnap.data?.date).toBe(FIXED_NOW)
    })

    it('writes marker with status=applied + migratedSetlistIds after successful apply', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })

        const marker = await fs.getDoc('system/v60TracksBackfill')
        expect(marker.exists).toBe(true)
        expect(marker.data?.status).toBe('applied')
        expect(marker.data?.appliedAt).toBe(FIXED_NOW)
        expect(marker.data?.migratedSetlistIds).toEqual(['sl1'])
    })

    it('re-run without --force is blocked by marker', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        const writesAfterFirst = fs.writes.set + fs.writes.update
        const result2 = await runBackfill(fs, {
            mode: 'apply',
            log,
            now: makeNow(),
        })
        expect(result2.skippedAlreadyApplied).toBe(true)
        expect(result2.migrated).toBe(0)
        // No additional writes occurred on second run.
        expect(fs.writes.set + fs.writes.update).toBe(writesAfterFirst)
    })

    it('re-run with --force bypasses the marker (but classification still skips already-hydrated setlists)', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        const result2 = await runBackfill(fs, {
            mode: 'apply',
            log,
            now: makeNow(),
            force: true,
        })
        // Marker check is bypassed (no early-return).
        expect(result2.skippedAlreadyApplied).toBeUndefined()
        // But sl1 is now hydrated:true from the prior apply, so classification
        // correctly reclassifies it as SKIP-HYDRATED — no double-migration.
        expect(result2.candidatesEvaluated).toBe(1)
        expect(result2.skippedHydrated).toBe(1)
        expect(result2.migrated).toBe(0)
    })
})

// -------------------------------------------------------------------------
// runBackfill — rollback mode (AC-6)
// -------------------------------------------------------------------------

describe('runBackfill — rollback mode', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
    })

    it('restores prev fields; uses FIELD_DELETE_SENTINEL for previously-undefined fields', async () => {
        // Setlist starts with hydrated/trackCount/songCount/fileIds all undefined.
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        // Apply migrates and writes denorm fields.
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        const postApply = await fs.getDoc('setlists/sl1')
        expect(postApply.data?.hydrated).toBe(true)

        // Rollback should DELETE the denorm fields (they didn't exist before).
        await runBackfill(fs, { mode: 'rollback', log, now: makeNow() })
        const postRollback = await fs.getDoc('setlists/sl1')
        expect(postRollback.data?.hydrated).toBeUndefined()
        expect(postRollback.data?.trackCount).toBeUndefined()
        expect(postRollback.data?.songCount).toBeUndefined()
        expect(postRollback.data?.fileIds).toBeUndefined()
        // Original date field preserved.
        expect(postRollback.data?.date).toBe(FIXED_NOW)
    })

    it('deletes top-level tracks scoped to migrated setlistIds; other setlists untouched', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        // Pre-existing top-level track for a DIFFERENT setlist — must survive rollback.
        fs.seed('tracks/external-track', {
            setlistId: 'other-setlist',
            order: 0,
        })

        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        // After apply, tracks/t1 exists.
        const t1Apply = await fs.getDoc('tracks/t1')
        expect(t1Apply.exists).toBe(true)

        await runBackfill(fs, { mode: 'rollback', log, now: makeNow() })
        const t1Rollback = await fs.getDoc('tracks/t1')
        expect(t1Rollback.exists).toBe(false)
        // External track must be preserved.
        const ext = await fs.getDoc('tracks/external-track')
        expect(ext.exists).toBe(true)
    })

    it('updates marker to status=rolled-back', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        await runBackfill(fs, { mode: 'rollback', log, now: makeNow() })

        const marker = await fs.getDoc('system/v60TracksBackfill')
        expect(marker.data?.status).toBe('rolled-back')
        expect(marker.data?.rolledBackAt).toBe(FIXED_NOW)
    })

    it('logs ERROR-MISSING-SNAPSHOT for orphan setlistId; continues with the rest', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        fs.seed(
            'setlists/sl2',
            makeSetlist('sl2', { tracks: [makeTrack({ id: 't2' })] }),
        )
        const { log, lines } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })
        // Tamper: delete the snapshot doc for sl2 before rollback.
        await fs.deleteDoc('migration_snapshots/sl2')

        const result = await runBackfill(fs, {
            mode: 'rollback',
            log,
            now: makeNow(),
        })
        expect(result.errors).toContain('missing-snapshot:sl2')
        // The orphan-missing log message should appear.
        expect(lines.some((l) => l.includes('ERROR-MISSING-SNAPSHOT'))).toBe(
            true,
        )
        // sl1 should still be restored.
        const sl1 = await fs.getDoc('setlists/sl1')
        expect(sl1.data?.hydrated).toBeUndefined()
    })

    it('refuses rollback when marker is absent unless --force', async () => {
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        const result = await runBackfill(fs, {
            mode: 'rollback',
            log,
            now: makeNow(),
        })
        expect(result.skippedNothingToRollback).toBe(true)
    })
})

// -------------------------------------------------------------------------
// Determinism (AC-7 now() injection)
// -------------------------------------------------------------------------

describe('determinism', () => {
    it('opts.now() injection produces deterministic snapshottedAt + appliedAt', async () => {
        const fs = new FakeFirestore()
        fs.seed(
            'setlists/sl1',
            makeSetlist('sl1', { tracks: [makeTrack({ id: 't1' })] }),
        )
        const { log } = logs()
        await runBackfill(fs, { mode: 'apply', log, now: makeNow() })

        const snap = await fs.getDoc('migration_snapshots/sl1')
        expect(snap.data?.snapshottedAt).toBe(FIXED_NOW)
        const marker = await fs.getDoc('system/v60TracksBackfill')
        expect(marker.data?.appliedAt).toBe(FIXED_NOW)
    })
})
