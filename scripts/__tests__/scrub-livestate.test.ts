import { beforeEach, describe, expect, it } from 'vitest'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from '../migrate-v50'
import { runScrub } from '../scrub-livestate'

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
            if (rest.includes('/')) continue
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

function seedTwoLiveStateSetlistsAndOneClean(fs: FakeFirestore): void {
    // Two setlists with liveState (orphan)
    fs.seed('setlists/sl1', {
        id: 'sl1',
        name: 'Service A',
        eventDate: 100,
        tracks: [{ id: 't1', title: 'Track 1' }],
        liveState: { currentIndex: 0, isLive: false },
    })
    fs.seed('setlists/sl2', {
        id: 'sl2',
        name: 'Service B',
        eventDate: 200,
        tracks: [{ id: 't2', title: 'Track 2' }],
        liveState: { currentIndex: 1, isLive: true },
    })
    // One setlist without liveState (untouched)
    fs.seed('setlists/sl3', {
        id: 'sl3',
        name: 'Service C',
        eventDate: 300,
        tracks: [{ id: 't3', title: 'Track 3' }],
    })
}

describe('runScrub — dry-run', () => {
    let fs: FakeFirestore

    beforeEach(() => {
        fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
    })

    it('reports affected count without writing', async () => {
        const { log, lines } = logs()
        const result = await runScrub(fs, {
            mode: 'dry-run',
            log,
            now: () => 1,
        })

        expect(result.mode).toBe('dry-run')
        expect(result.affectedCount).toBe(2)
        expect(result.sampleIds).toEqual(expect.arrayContaining(['sl1', 'sl2']))
        expect(fs.writes).toEqual({ set: 0, update: 0, delete: 0 })
        expect(lines.some((l) => l.includes('DRY-RUN: 2 setlists'))).toBe(true)
    })

    it('does not create the marker', async () => {
        await runScrub(fs, { mode: 'dry-run', log: () => {}, now: () => 1 })
        const marker = await fs.getDoc('system/livestateScrub')
        expect(marker.exists).toBe(false)
    })

    it('skips clean setlists', async () => {
        const result = await runScrub(fs, {
            mode: 'dry-run',
            log: () => {},
            now: () => 1,
        })
        expect(result.sampleIds).not.toContain('sl3')
    })
})

describe('runScrub — apply', () => {
    let fs: FakeFirestore

    beforeEach(() => {
        fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
    })

    it('removes liveState field from affected setlists', async () => {
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })

        const sl1 = (await fs.getDoc('setlists/sl1')).data!
        const sl2 = (await fs.getDoc('setlists/sl2')).data!
        expect('liveState' in sl1).toBe(false)
        expect('liveState' in sl2).toBe(false)
    })

    it('preserves all other setlist fields', async () => {
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })

        const sl1 = (await fs.getDoc('setlists/sl1')).data!
        expect(sl1.id).toBe('sl1')
        expect(sl1.name).toBe('Service A')
        expect(sl1.eventDate).toBe(100)
        expect(sl1.tracks).toEqual([{ id: 't1', title: 'Track 1' }])
    })

    it('does not touch clean setlists', async () => {
        const sl3Before = (await fs.getDoc('setlists/sl3')).data!
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const sl3After = (await fs.getDoc('setlists/sl3')).data!
        expect(sl3After).toEqual(sl3Before)
    })

    it('writes rollback snapshots before each delete', async () => {
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 99 })

        const snap1 = await fs.getDoc(
            'migrations/livestate-scrub/snapshot/sl1',
        )
        expect(snap1.exists).toBe(true)
        expect(snap1.data?.liveState).toEqual({
            currentIndex: 0,
            isLive: false,
        })
        expect(snap1.data?.snapshottedAt).toBe(99)

        const snap2 = await fs.getDoc(
            'migrations/livestate-scrub/snapshot/sl2',
        )
        expect(snap2.data?.liveState).toEqual({
            currentIndex: 1,
            isLive: true,
        })
    })

    it('writes the marker on success', async () => {
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 555 })
        const marker = await fs.getDoc('system/livestateScrub')
        expect(marker.exists).toBe(true)
        expect(marker.data?.appliedAt).toBe(555)
        expect(marker.data?.affectedCount).toBe(2)
    })

    it('returns affectedCount matching dry-run', async () => {
        const dryFs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(dryFs)
        const dry = await runScrub(dryFs, {
            mode: 'dry-run',
            log: () => {},
            now: () => 1,
        })
        const apply = await runScrub(fs, {
            mode: 'apply',
            log: () => {},
            now: () => 1,
        })
        expect(apply.affectedCount).toBe(dry.affectedCount)
    })
})

describe('runScrub — idempotency', () => {
    it('skips when marker present and --force not set', async () => {
        const fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        const writesAfterFirst = { ...fs.writes }

        const { log, lines } = logs()
        const result = await runScrub(fs, {
            mode: 'apply',
            log,
            now: () => 2,
        })
        expect(result.skippedAlreadyApplied).toBe(true)
        expect(fs.writes).toEqual(writesAfterFirst)
        expect(lines.some((l) => l.includes('Already applied'))).toBe(true)
    })

    it('--force re-runs even with marker present', async () => {
        const fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })

        // Re-seed liveState so there's something to scrub on second run
        fs.seed('setlists/sl1', {
            id: 'sl1',
            name: 'Service A',
            liveState: { currentIndex: 5 },
        })

        const result = await runScrub(fs, {
            mode: 'apply',
            force: true,
            log: () => {},
            now: () => 2,
        })
        expect(result.skippedAlreadyApplied).toBeFalsy()
        expect(result.affectedCount).toBe(1)
    })
})

describe('runScrub — rollback', () => {
    it('restores liveState from snapshots', async () => {
        const fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })

        const sl1AfterApply = (await fs.getDoc('setlists/sl1')).data!
        expect('liveState' in sl1AfterApply).toBe(false)

        await runScrub(fs, { mode: 'rollback', log: () => {}, now: () => 2 })

        const sl1AfterRollback = (await fs.getDoc('setlists/sl1')).data!
        expect(sl1AfterRollback.liveState).toEqual({
            currentIndex: 0,
            isLive: false,
        })
    })

    it('deletes the marker', async () => {
        const fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })
        await runScrub(fs, { mode: 'rollback', log: () => {}, now: () => 2 })

        const marker = await fs.getDoc('system/livestateScrub')
        expect(marker.exists).toBe(false)
    })

    it('reports restored count', async () => {
        const fs = new FakeFirestore()
        seedTwoLiveStateSetlistsAndOneClean(fs)
        await runScrub(fs, { mode: 'apply', log: () => {}, now: () => 1 })

        const result = await runScrub(fs, {
            mode: 'rollback',
            log: () => {},
            now: () => 2,
        })
        expect(result.mode).toBe('rollback')
        expect(result.affectedCount).toBe(2)
    })
})
