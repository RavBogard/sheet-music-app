import { beforeEach, describe, expect, it } from 'vitest'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from '../migrate-v50'
import { runBootstrap } from '../bootstrap-songs'

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

function seedLibrary(fs: FakeFirestore): void {
    // Active chart-shaped library_index docs (PDFs)
    fs.seed('library_index/lib1', {
        name: 'Adon Olam',
        status: 'active',
        mimeType: 'application/pdf',
    })
    fs.seed('library_index/lib2', {
        name: 'Hinei Ma Tov',
        status: 'active',
        mimeType: 'application/pdf',
    })
    fs.seed('library_index/lib3', {
        name: 'Lecha Dodi',
        mimeType: 'application/pdf',
    }) // status absent → treated as active
    // Archived (skipped)
    fs.seed('library_index/lib4', {
        name: 'Old Tune',
        status: 'archived',
        mimeType: 'application/pdf',
    })
    // Unnamed (skipped)
    fs.seed('library_index/lib5', { status: 'active', mimeType: 'application/pdf' })
    fs.seed('library_index/lib6', {
        name: '   ',
        status: 'active',
        mimeType: 'application/pdf',
    })
    // Non-chart MIME types (skipped) — folders, audio, docs, spreadsheets
    fs.seed('library_index/folder1', {
        name: 'Sheet Music',
        status: 'active',
        mimeType: 'application/vnd.google-apps.folder',
    })
    fs.seed('library_index/audio1', {
        name: 'Adon Olam (rehearsal).mp3',
        status: 'active',
        mimeType: 'audio/mpeg',
    })
    fs.seed('library_index/doc1', {
        name: 'Lyrics',
        status: 'active',
        mimeType: 'application/vnd.google-apps.document',
    })
}

function seedSetlistsWithTracks(fs: FakeFirestore): void {
    fs.seed('setlists/sl1', {
        id: 'sl1',
        tracks: [
            { fileId: 'lib1', key: 'C' }, // back-stitch candidate
            { fileId: 'lib2', songId: 'lib2', key: 'F' }, // already linked, skip
            { fileId: 'lib4', key: 'D' }, // archived target — still gets back-stitched IF lib4 in songs/* (it isn't, so skip)
            { fileId: 'lib1', key: 'G' }, // duplicate fileId — also a candidate
            { key: 'A' }, // no fileId — skip
        ],
    })
    fs.seed('setlists/sl2', {
        id: 'sl2',
        tracks: [
            { fileId: 'lib3', leadMusician: 'Daniel' }, // back-stitch candidate
        ],
    })
    fs.seed('setlists/sl3', {
        // no tracks at all
        id: 'sl3',
    })
}

function seedTopLevelTracks(fs: FakeFirestore): void {
    fs.seed('tracks/t1', { id: 't1', setlistId: 'sl1', fileId: 'lib2', order: 0 })
    fs.seed('tracks/t2', {
        id: 't2',
        setlistId: 'sl1',
        fileId: 'lib1',
        songId: 'lib1', // already linked
        order: 1,
    })
    fs.seed('tracks/t3', {
        id: 't3',
        setlistId: 'sl2',
        fileId: 'lib3',
        order: 0,
    })
}

describe('runBootstrap — dry-run (AC-1)', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedLibrary(fs)
        seedSetlistsWithTracks(fs)
        seedTopLevelTracks(fs)
    })

    it('counts active chart-shaped library_index rows; writes nothing; no marker', async () => {
        const { log } = logs()
        const result = await runBootstrap(fs, { mode: 'dry-run', log })
        expect(result.songsWritten).toBe(3) // lib1, lib2, lib3 (PDFs)
        expect(result.songsSkippedArchived).toBe(6) // lib4 archived + lib5/lib6 unnamed + folder1 + audio1 + doc1
        expect(fs.writes.set).toBe(0)
        expect(fs.writes.update).toBe(0)
        const marker = await fs.getDoc('system/v54SongsBootstrap')
        expect(marker.exists).toBe(false)
    })

    it('reports back-stitch candidates without writing them', async () => {
        const { log } = logs()
        const result = await runBootstrap(fs, { mode: 'dry-run', log })
        // Setlists: sl1.tracks[0] (lib1), sl1.tracks[3] (lib1), sl2.tracks[0] (lib3) — sl1.tracks[2] lib4 is archived/not-bootstrapped, sl1.tracks[1] already has songId
        // Top-level: tracks/t1 (lib2), tracks/t3 (lib3) — tracks/t2 already has songId
        expect(result.backstitchedTracks).toBe(5)
        expect(fs.writes.update).toBe(0)
    })

    it('respects --no-backstitch in dry-run (no count, no writes)', async () => {
        const { log } = logs()
        const result = await runBootstrap(fs, {
            mode: 'dry-run',
            log,
            backstitch: false,
        })
        expect(result.backstitchedTracks).toBe(0)
        expect(fs.writes.update).toBe(0)
    })
})

describe('runBootstrap — apply (AC-2, AC-3)', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedLibrary(fs)
    })

    it('writes one songs/{libId} per active library_index row', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log, now: () => 5000 })

        const s1 = await fs.getDoc('songs/lib1')
        expect(s1.exists).toBe(true)
        expect(s1.data).toMatchObject({
            id: 'lib1',
            title: 'Adon Olam',
            normalizedTitle: 'adon olam',
            fileId: 'lib1',
            createdAt: 5000,
        })

        const s2 = await fs.getDoc('songs/lib2')
        expect(s2.exists).toBe(true)
        const s3 = await fs.getDoc('songs/lib3')
        expect(s3.exists).toBe(true)

        // Archived + unnamed must NOT have been written
        const sArchived = await fs.getDoc('songs/lib4')
        expect(sArchived.exists).toBe(false)
        const s5 = await fs.getDoc('songs/lib5')
        expect(s5.exists).toBe(false)
        const s6 = await fs.getDoc('songs/lib6')
        expect(s6.exists).toBe(false)
    })

    it('preserves defaults/recent on a pre-existing songs/{id} doc', async () => {
        fs.seed('songs/lib1', {
            id: 'lib1',
            title: 'Adon Olam (old title)',
            defaults: { key: 'A' },
            recent: [{ key: 'A', setlistId: 'sl1', performedAt: 1000 }],
            createdAt: 100,
        })

        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log, now: () => 5000 })

        const after = await fs.getDoc('songs/lib1')
        expect(after.data).toMatchObject({
            id: 'lib1',
            title: 'Adon Olam', // updated to library_index name
            normalizedTitle: 'adon olam',
            fileId: 'lib1',
            createdAt: 100, // preserved
            defaults: { key: 'A' },
            recent: [{ key: 'A', setlistId: 'sl1', performedAt: 1000 }],
        })
    })

    it('writes marker doc with apply summary', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log, now: () => 5000 })

        const marker = await fs.getDoc('system/v54SongsBootstrap')
        expect(marker.exists).toBe(true)
        expect(marker.data).toMatchObject({
            appliedAt: 5000,
            songsWritten: 3,
            songsSkippedArchived: 6,
            includedBackstitch: true,
        })
    })

    it('skips non-chart mimeTypes (folders, audio, docs, spreadsheets)', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log })
        // Only PDF rows should have been written.
        expect((await fs.getDoc('songs/lib1')).exists).toBe(true)
        expect((await fs.getDoc('songs/folder1')).exists).toBe(false)
        expect((await fs.getDoc('songs/audio1')).exists).toBe(false)
        expect((await fs.getDoc('songs/doc1')).exists).toBe(false)
    })

    it('accepts MusicXML mimeType', async () => {
        const fs2 = new FakeFirestore()
        fs2.seed('library_index/lib1', {
            name: 'Niggun.musicxml',
            status: 'active',
            mimeType: 'application/vnd.recordare.musicxml+xml',
        })
        fs2.seed('library_index/lib2', {
            name: 'Other.xml',
            status: 'active',
            mimeType: 'application/xml',
        })
        const { log } = logs()
        const r = await runBootstrap(fs2, { mode: 'apply', log })
        expect(r.songsWritten).toBe(2)
        expect((await fs2.getDoc('songs/lib1')).exists).toBe(true)
        expect((await fs2.getDoc('songs/lib2')).exists).toBe(true)
    })
})

describe('runBootstrap — idempotency (AC-2)', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedLibrary(fs)
    })

    it('second --apply without --force exits early', async () => {
        const { log: l1 } = logs()
        const r1 = await runBootstrap(fs, { mode: 'apply', log: l1, now: () => 1000 })
        expect(r1.songsWritten).toBe(3)

        const beforeWrites = fs.writes.set
        const { log: l2 } = logs()
        const r2 = await runBootstrap(fs, { mode: 'apply', log: l2, now: () => 2000 })
        expect(r2.skippedAlreadyApplied).toBe(true)
        expect(fs.writes.set).toBe(beforeWrites) // no new writes
    })

    it('second --apply with --force is idempotent (no diff)', async () => {
        const { log: l1 } = logs()
        await runBootstrap(fs, { mode: 'apply', log: l1, now: () => 1000 })

        const lib1Before = await fs.getDoc('songs/lib1')
        const { log: l2 } = logs()
        const r2 = await runBootstrap(fs, {
            mode: 'apply',
            log: l2,
            force: true,
            now: () => 2000,
        })
        // All three already match -> songsWritten 0, songsAlreadyMatching 3
        expect(r2.songsWritten).toBe(0)
        expect(r2.songsAlreadyMatching).toBe(3)
        const lib1After = await fs.getDoc('songs/lib1')
        // Bootstrap-managed fields equal; createdAt preserved
        expect(lib1After.data).toEqual(lib1Before.data)
    })
})

describe('runBootstrap — back-stitch (AC-5)', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedLibrary(fs)
        seedSetlistsWithTracks(fs)
        seedTopLevelTracks(fs)
    })

    it('sets songId on tracks where fileId matches and songId is unset', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log })

        const sl1 = await fs.getDoc('setlists/sl1')
        const sl1Tracks = sl1.data?.tracks as Array<Record<string, unknown>>
        expect(sl1Tracks[0]).toMatchObject({ fileId: 'lib1', songId: 'lib1' })
        expect(sl1Tracks[3]).toMatchObject({ fileId: 'lib1', songId: 'lib1' })

        const sl2 = await fs.getDoc('setlists/sl2')
        const sl2Tracks = sl2.data?.tracks as Array<Record<string, unknown>>
        expect(sl2Tracks[0]).toMatchObject({ fileId: 'lib3', songId: 'lib3' })

        const t1 = await fs.getDoc('tracks/t1')
        expect(t1.data?.songId).toBe('lib2')
        const t3 = await fs.getDoc('tracks/t3')
        expect(t3.data?.songId).toBe('lib3')
    })

    it('does not overwrite an existing songId', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log })

        const sl1 = await fs.getDoc('setlists/sl1')
        const sl1Tracks = sl1.data?.tracks as Array<Record<string, unknown>>
        expect(sl1Tracks[1].songId).toBe('lib2') // pre-existing, untouched

        const t2 = await fs.getDoc('tracks/t2')
        expect(t2.data?.songId).toBe('lib1') // pre-existing, untouched
    })

    it('skips tracks whose fileId points at no songs/* doc', async () => {
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log })

        const sl1 = await fs.getDoc('setlists/sl1')
        const sl1Tracks = sl1.data?.tracks as Array<Record<string, unknown>>
        // sl1.tracks[2] has fileId=lib4 (archived; no songs/lib4 written) → no songId
        expect(sl1Tracks[2].songId).toBeUndefined()
        // sl1.tracks[4] has no fileId at all → no songId
        expect(sl1Tracks[4].songId).toBeUndefined()
    })

    it('--no-backstitch skips the back-stitch loop', async () => {
        const { log } = logs()
        const result = await runBootstrap(fs, {
            mode: 'apply',
            log,
            backstitch: false,
        })
        expect(result.backstitchedTracks).toBe(0)

        const sl1 = await fs.getDoc('setlists/sl1')
        const sl1Tracks = sl1.data?.tracks as Array<Record<string, unknown>>
        expect(sl1Tracks[0].songId).toBeUndefined()
        const t1 = await fs.getDoc('tracks/t1')
        expect(t1.data?.songId).toBeUndefined()

        const marker = await fs.getDoc('system/v54SongsBootstrap')
        expect(marker.data?.includedBackstitch).toBe(false)
    })
})

describe('runBootstrap — rollback (AC-4)', () => {
    let fs: FakeFirestore
    beforeEach(() => {
        fs = new FakeFirestore()
        seedLibrary(fs)
    })

    it('deletes bootstrap-created docs that have no defaults/recent', async () => {
        const { log: l1 } = logs()
        await runBootstrap(fs, { mode: 'apply', log: l1 })

        const { log: l2 } = logs()
        const r = await runBootstrap(fs, { mode: 'rollback', log: l2 })
        expect(r.rolledBack?.deleted).toBe(3)
        expect(r.rolledBack?.preservedDueToMemory).toBe(0)
        expect(r.rolledBack?.restored).toBe(0)

        expect((await fs.getDoc('songs/lib1')).exists).toBe(false)
        expect((await fs.getDoc('songs/lib2')).exists).toBe(false)
        expect((await fs.getDoc('songs/lib3')).exists).toBe(false)
        expect((await fs.getDoc('system/v54SongsBootstrap')).exists).toBe(false)
    })

    it('preserves bootstrap-created docs that have gained sticky memory', async () => {
        const { log: l1 } = logs()
        await runBootstrap(fs, { mode: 'apply', log: l1 })

        // Simulate sticky memory propagation post-bootstrap
        const lib1 = await fs.getDoc('songs/lib1')
        await fs.setDoc('songs/lib1', {
            ...(lib1.data ?? {}),
            defaults: { key: 'C' },
            recent: [{ key: 'C', setlistId: 'sl1', performedAt: 1000 }],
        })

        const { log: l2 } = logs()
        const r = await runBootstrap(fs, { mode: 'rollback', log: l2 })
        expect(r.rolledBack?.deleted).toBe(2) // lib2 + lib3
        expect(r.rolledBack?.preservedDueToMemory).toBe(1) // lib1

        const lib1After = await fs.getDoc('songs/lib1')
        expect(lib1After.exists).toBe(true)
        expect(lib1After.data?.defaults).toEqual({ key: 'C' })
    })

    it('restores pre-existing docs to their prior bootstrap-managed fields', async () => {
        // Pre-existing song doc with a different title/normalizedTitle/fileId
        fs.seed('songs/lib1', {
            id: 'lib1',
            title: 'Original Title',
            normalizedTitle: 'original title',
            fileId: 'someOtherId',
            defaults: { key: 'A' },
        })

        const { log: l1 } = logs()
        await runBootstrap(fs, { mode: 'apply', log: l1 })

        // Bootstrap should have updated the bootstrap-managed fields and
        // preserved defaults
        const afterApply = await fs.getDoc('songs/lib1')
        expect(afterApply.data?.title).toBe('Adon Olam')
        expect(afterApply.data?.fileId).toBe('lib1')
        expect(afterApply.data?.defaults).toEqual({ key: 'A' })

        const { log: l2 } = logs()
        const r = await runBootstrap(fs, { mode: 'rollback', log: l2 })
        expect(r.rolledBack?.restored).toBe(1)

        const restored = await fs.getDoc('songs/lib1')
        expect(restored.data?.title).toBe('Original Title')
        expect(restored.data?.normalizedTitle).toBe('original title')
        expect(restored.data?.fileId).toBe('someOtherId')
        // sticky memory preserved through round-trip
        expect(restored.data?.defaults).toEqual({ key: 'A' })
    })
})

describe('runBootstrap — normalizedTitle shape', () => {
    it('lowercases and trims; matches what prime.ts writes today', async () => {
        const fs = new FakeFirestore()
        fs.seed('library_index/lib1', {
            name: '  Mi Chamocha  ',
            status: 'active',
            mimeType: 'application/pdf',
        })
        const { log } = logs()
        await runBootstrap(fs, { mode: 'apply', log })
        const s = await fs.getDoc('songs/lib1')
        expect(s.data?.title).toBe('Mi Chamocha')
        expect(s.data?.normalizedTitle).toBe('mi chamocha')
    })
})
