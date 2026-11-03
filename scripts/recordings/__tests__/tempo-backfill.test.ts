import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { Recording, RecordingTempo } from '../../../src/types/models'
import { backfill, type BackfillDeps } from '../tempo-backfill'

const rec = (id: string, extra: Partial<Recording> = {}): Recording => ({
    id, orgId: 'crc', songId: `s-${id}`, title: 't', storagePath: `recordings/${id}.mp3`, createdAt: '2026-01-01', createdBy: 'ingest', ...extra,
})
const T: RecordingTempo = { bpm: 96, alt: 48, confidence: 0.8, confident: true, method: 'librosa-tempogram-v1' }

function deps(recs: Recording[]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'))
    const d: BackfillDeps = {
        listRecordings: async () => recs,
        fetch: async (p, into) => {
            const f = path.join(into, p.replace(/\//g, '_'))
            fs.writeFileSync(f, 'mp3')
            return f
        },
        analyse: (files) => new Map(files.map((f) => [f, f.includes('bad') ? { error: 'decode failed' } : T])),
        update: vi.fn(async () => {}),
        now: () => '2026-11-03T00:00:00.000Z',
    }
    return { d, dir }
}

describe('tempo back-fill', () => {
    it('a dry run analyses recordings with no tempo and writes nothing', async () => {
        const { d, dir } = deps([rec('a'), rec('b', { tempo: T }), rec('bad')])
        const plan = await backfill(d, { write: false, dir })
        expect(plan.analysed.map((r) => r.id)).toEqual(['a', 'bad'])
        expect(plan.analysed[0].tempo).toMatchObject({ bpm: 96, analyzedAt: '2026-11-03T00:00:00.000Z' })
        expect(plan.analysed[1].error).toBe('decode failed')
        expect(plan.alreadyMeasured).toBe(1)
        expect(d.update).not.toHaveBeenCalled()
    })

    it('--write stores the tempo; --all re-analyses measured ones', async () => {
        const { d, dir } = deps([rec('a'), rec('b', { tempo: T })])
        await backfill(d, { write: true, all: true, dir })
        expect((d.update as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    })
})
