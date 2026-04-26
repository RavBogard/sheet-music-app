import { beforeEach, describe, expect, it } from 'vitest'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
    runMigration,
} from '../migrate-v50'

class FakeFirestore implements MigrationFirestore {
    docs = new Map<string, Record<string, unknown>>()
    writes = { set: 0, update: 0, delete: 0 }

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
            if (rest.includes('/')) continue // direct children only
            out.push({ id: rest, data: structuredClone(data) })
        }
        return out
    }

    async setDoc(path: string, data: Record<string, unknown>): Promise<void> {
        this.writes.set += 1
        this.docs.set(path, structuredClone(data))
    }

    async updateDoc(
        path: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        this.writes.update += 1
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
        this.docs.delete(path)
    }
}

function logs(): { log: (msg: string) => void; lines: string[] } {
    const lines: string[] = []
    return { log: (m) => lines.push(m), lines }
}

function seedThreeSetlists(fs: FakeFirestore): void {
    // Songs A, B, C exist
    fs.seed('songs/songA', { id: 'songA', title: 'Adon Olam' })
    fs.seed('songs/songB', { id: 'songB', title: 'Hinei Ma Tov' })
    fs.seed('songs/songC', { id: 'songC', title: 'Lecha Dodi' })

    // setlist sl1 (oldest, eventDate=100)
    fs.seed('setlists/sl1', {
        id: 'sl1',
        eventDate: 100,
        tracks: [
            { songId: 'songA', key: 'C', leadMusician: 'Randy', bpm: 80 },
            { songId: 'songB', key: 'F' },
            { songId: 'orphan', key: 'X' }, // no songs/orphan doc — skipped
            { key: 'reading-no-songid' }, // no songId — skipped
        ],
    })
    // setlist sl2 (eventDate=200)
    fs.seed('setlists/sl2', {
        id: 'sl2',
        eventDate: 200,
        tracks: [
            { songId: 'songA', key: 'D', bpm: 92 },
            { songId: 'songC', leadMusician: 'Daniel' },
        ],
    })
    // setlist sl3 (newest, eventDate=300)
    fs.seed('setlists/sl3', {
        id: 'sl3',
        eventDate: 300,
        tracks: [
            { songId: 'songA', key: 'E', leadMusician: 'Mira' }, // most-recent A
            { songId: 'songC', key: 'A', bpm: 110 },
        ],
    })
}

describe('runMigration — apply', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedThreeSetlists(fs)
    })

    it('writes defaults from most-recent setlist occurrence per field', async () => {
        const { log } = logs()
        const result = await runMigration(fs, {
            mode: 'apply',
            log,
            now: () => 999,
        })
        expect(result.affectedSongCount).toBe(3)
        expect(result.setlistInvariant).toBe(true)

        const a = (await fs.getDoc('songs/songA')).data!
        // most-recent: key from sl3 (E), lead from sl3 (Mira), bpm from sl2 (92)
        expect(a.defaults).toEqual({ key: 'E', lead: 'Mira', bpm: 92 })

        const b = (await fs.getDoc('songs/songB')).data!
        expect(b.defaults).toEqual({ key: 'F' })

        const c = (await fs.getDoc('songs/songC')).data!
        // lead from sl2, key+bpm from sl3
        expect(c.defaults).toEqual({ key: 'A', lead: 'Daniel', bpm: 110 })
    })

    it('writes recent[] capped at 5, latest first', async () => {
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const a = (await fs.getDoc('songs/songA')).data! as Record<
            string,
            unknown
        >
        const recent = a.recent as Array<{ setlistId: string }>
        expect(recent).toHaveLength(3)
        expect(recent[0].setlistId).toBe('sl3') // newest first
        expect(recent[2].setlistId).toBe('sl1')
    })

    it('writes the system/migrations/v50 marker', async () => {
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 999 })
        const marker = await fs.getDoc('system/migrations/v50')
        expect(marker.exists).toBe(true)
        expect(marker.data?.appliedAt).toBe(999)
        expect(marker.data?.affectedSongCount).toBe(3)
    })

    it('snapshots existing defaults before mutating songs/*', async () => {
        // pre-seed songA with existing defaults
        fs.seed('songs/songA', {
            id: 'songA',
            title: 'Adon Olam',
            defaults: { key: 'OLD' },
            recent: [
                {
                    key: 'OLD',
                    setlistId: 'previous',
                    performedAt: 1,
                },
            ],
        })
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 99 })
        const snap = await fs.getDoc('migrations/v50/snapshot/songA')
        expect(snap.exists).toBe(true)
        expect(snap.data?.defaults).toEqual({ key: 'OLD' })
        expect(snap.data?.recent).toBeTruthy()
    })

    it('skips orphan tracks pointing to non-existent songs', async () => {
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const orphan = await fs.getDoc('songs/orphan')
        expect(orphan.exists).toBe(false)
    })

    it('preserves setlist documents (invariance hash matches)', async () => {
        const before = await fs.listCollection('setlists')
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const after = await fs.listCollection('setlists')
        for (const a of before) {
            const b = after.find((x) => x.id === a.id)!
            expect(JSON.stringify(b.data)).toBe(JSON.stringify(a.data))
        }
    })
})

describe('runMigration — idempotency', () => {
    it('exits early when marker exists and --force not set', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const writesAfterFirst = { ...fs.writes }

        const { log, lines } = logs()
        const result = await runMigration(fs, { mode: 'apply', log, now: () => 2 })
        expect(result.skippedAlreadyApplied).toBe(true)
        expect(fs.writes).toEqual(writesAfterFirst)
        expect(lines.some((l) => l.includes('Already applied'))).toBe(true)
    })

    it('--force re-runs even with marker present', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const result = await runMigration(fs, {
            mode: 'apply',
            force: true,
            log: () => {},
            now: () => 2,
        })
        expect(result.skippedAlreadyApplied).toBeFalsy()
        expect(result.affectedSongCount).toBe(3)
    })
})

describe('runMigration — dry-run', () => {
    it('produces zero writes and reports planned changes', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        const { log, lines } = logs()
        const result = await runMigration(fs, {
            mode: 'dry-run',
            log,
            now: () => 1,
        })
        expect(result.affectedSongCount).toBe(3)
        expect(fs.writes).toEqual({ set: 0, update: 0, delete: 0 })
        expect(lines.some((l) => l.includes('[DRY] songs/'))).toBe(true)
        const marker = await fs.getDoc('system/migrations/v50')
        expect(marker.exists).toBe(false)
    })

    it('lists first 3 affected songs as samples', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        const { log, lines } = logs()
        await runMigration(fs, { mode: 'dry-run', log, now: () => 1 })
        const dryLines = lines.filter((l) => l.startsWith('[DRY] songs/'))
        expect(dryLines.length).toBeGreaterThan(0)
        expect(dryLines.length).toBeLessThanOrEqual(3)
    })
})

describe('runMigration — rollback', () => {
    it('restores defaults + recent from snapshots and deletes the marker', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        // Pre-seed songA with prior defaults so rollback has something to restore TO.
        fs.seed('songs/songA', {
            id: 'songA',
            title: 'Adon Olam',
            defaults: { key: 'PRIOR' },
            recent: [
                { key: 'PRIOR', setlistId: 'old', performedAt: 1 },
            ],
        })

        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const aPostApply = (await fs.getDoc('songs/songA')).data!
        expect(aPostApply.defaults).toEqual({
            key: 'E',
            lead: 'Mira',
            bpm: 92,
        })

        await runMigration(fs, { mode: 'rollback', log: () => {}, now: () => 2 })
        const aPostRollback = (await fs.getDoc('songs/songA')).data!
        expect(aPostRollback.defaults).toEqual({ key: 'PRIOR' })
        expect(aPostRollback.recent).toHaveLength(1)

        const marker = await fs.getDoc('system/migrations/v50')
        expect(marker.exists).toBe(false)
    })

    it('removes defaults entirely when pre-migration value was absent', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)
        await runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        await runMigration(fs, { mode: 'rollback', log: () => {}, now: () => 2 })
        const a = (await fs.getDoc('songs/songA')).data!
        expect('defaults' in a).toBe(false)
        expect('recent' in a).toBe(false)
    })
})

describe('runMigration — setlist invariance regression guard', () => {
    it('aborts if a setlist mutates between pre-hash and post-hash', async () => {
        const fs = new FakeFirestore()
        seedThreeSetlists(fs)

        // Wrap updateDoc to ALSO mutate a setlist on first call — this simulates
        // a regression where an unrelated migration step accidentally writes to
        // setlists. The post-hash check should catch it.
        const origUpdate = fs.updateDoc.bind(fs)
        let mutated = false
        fs.updateDoc = async (path, data) => {
            await origUpdate(path, data)
            if (!mutated && path.startsWith('songs/')) {
                mutated = true
                fs.docs.set('setlists/sl1', { id: 'sl1', tracks: [], hacked: true })
            }
        }

        await expect(
            runMigration(fs, { mode: 'apply', log: () => {}, now: () => 1 }),
        ).rejects.toThrow(/Setlist invariance violated/)
    })
})
