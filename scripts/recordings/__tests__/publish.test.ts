import { describe, expect, it, vi } from 'vitest'

import type { Recording } from '../../../src/types/models'
import { ingestKey, publish, type ManifestRow, type PublishDeps } from '../publish'

function row(over: Partial<ManifestRow> = {}): ManifestRow {
    return {
        folder: 'SHIR SHABBATS/6.19',
        file: '6.19_SHIR SHABBAT_V2.mp3',
        mix: 'V2',
        serviceDate: '2026-06-19',
        label: 'Shir Shabbat, Jun 19, 2026',
        setlistId: 'sl-1',
        setlistState: 'matched',
        songId: 'song-a',
        title: 'Strange Fruit',
        startSec: 100,
        endSec: 300,
        confidence: 0.85,
        status: 'live',
        clip: 'clips/a.mp3',
        ...over,
    }
}

/** In-memory Firestore + Storage fakes behind the PublishDeps seam. */
function fakes(seed: Recording[] = []) {
    const docs = new Map<string, Recording>(seed.map((r) => [r.id, r]))
    const files = new Map<string, { bytes: Buffer; contentType: string }>()
    let n = 0
    const deps: PublishDeps = {
        findByIngestKeys: vi.fn(async (keys: string[]) =>
            [...docs.values()].filter((d) => d.orgId === 'crc' && d.ingestKey && keys.includes(d.ingestKey)).map((d) => d.ingestKey!),
        ),
        recordingsForSongs: vi.fn(async (ids: string[]) => [...docs.values()].filter((d) => d.orgId === 'crc' && ids.includes(d.songId!))),
        newId: () => `rec-${++n}`,
        readClip: (rel: string) => Buffer.from(`mp3:${rel}`),
        upload: vi.fn(async (p: string, bytes: Buffer, contentType: string) => {
            files.set(p, { bytes, contentType })
        }),
        writeDoc: vi.fn(async (id: string, doc: Recording) => {
            docs.set(id, doc)
        }),
        setFeatured: vi.fn(async (id: string) => {
            docs.set(id, { ...docs.get(id)!, featured: true })
        }),
        now: () => '2026-11-01T00:00:00.000Z',
    }
    return { deps, docs, files }
}

describe('recordings publish', () => {
    it('publish skips rows whose ingestKey exists', async () => {
        const { deps, docs, files } = fakes()
        const manifest = [row(), row({ songId: 'song-b', startSec: 400, endSec: 600, clip: 'clips/b.mp3', status: 'held' })]

        const first = await publish(manifest, deps, { dryRun: false })
        expect(first.toWrite).toHaveLength(2)
        expect(docs.size).toBe(2)
        expect(files.size).toBe(2)

        const again = await publish(manifest, deps, { dryRun: false })
        expect(again.toWrite).toHaveLength(0)
        expect(again.skippedExisting.map((s) => s.ingestKey).sort()).toEqual(manifest.map(ingestKey).sort())
        expect(docs.size).toBe(2)
        expect(files.size).toBe(2)
    })

    it('writes the Recording fields and uploads audio/mpeg to recordings/<id>.mp3', async () => {
        const { deps, docs, files } = fakes()
        await publish([row()], deps, { dryRun: false })
        const doc = docs.get('rec-1')!
        expect(doc).toMatchObject({
            id: 'rec-1',
            orgId: 'crc',
            songId: 'song-a',
            storagePath: 'recordings/rec-1.mp3',
            mimeType: 'audio/mpeg',
            status: 'live',
            ingestKey: ingestKey(row()),
            createdBy: 'ingest',
            source: { file: '6.19_SHIR SHABBAT_V2.mp3', serviceDate: '2026-06-19', startSec: 100, endSec: 300, confidence: 0.85, setlistId: 'sl-1' },
        })
        expect(files.get('recordings/rec-1.mp3')?.contentType).toBe('audio/mpeg')
    })

    it('dry run writes nothing and still reports the full plan', async () => {
        const { deps, docs, files } = fakes()
        const plan = await publish([row()], deps, { dryRun: true })
        expect(plan.toWrite).toHaveLength(1)
        expect(plan.featured).toEqual([{ songId: 'song-a', recordingId: 'rec-1' }])
        expect(docs.size).toBe(0)
        expect(files.size).toBe(0)
        expect(deps.upload).not.toHaveBeenCalled()
        expect(deps.writeDoc).not.toHaveBeenCalled()
        expect(deps.setFeatured).not.toHaveBeenCalled()
    })

    it('features a live take, never a held one, and keeps an explicit choice', async () => {
        const explicit: Recording = {
            id: 'old', orgId: 'crc', songId: 'song-c', title: 'x', storagePath: 'recordings/old.mp3',
            createdAt: '2026-01-01', createdBy: 'u', featured: true,
        }
        const { deps, docs } = fakes([explicit])
        await publish(
            [row(), row({ songId: 'song-b', startSec: 1, endSec: 2, clip: 'clips/b.mp3', status: 'held' }), row({ songId: 'song-c', startSec: 3, endSec: 4, clip: 'clips/c.mp3' })],
            deps,
            { dryRun: false },
        )
        const bySong = (s: string) => [...docs.values()].filter((d) => d.songId === s)
        expect(bySong('song-a').map((d) => d.featured)).toEqual([true])
        expect(bySong('song-b').map((d) => d.featured)).toEqual([false])
        expect(bySong('song-c').find((d) => d.id !== 'old')?.featured).toBe(false)
        expect(docs.get('old')?.featured).toBe(true)
    })

    it('never publishes dropped rows, rows without a chart, or services without a setlist', async () => {
        const { deps, docs } = fakes()
        const plan = await publish(
            [row({ status: 'dropped' }), row({ songId: null, startSec: 1 }), row({ setlistState: 'none', startSec: 2 })],
            deps,
            { dryRun: false },
        )
        expect(plan.toWrite).toHaveLength(0)
        expect(docs.size).toBe(0)
    })
})
