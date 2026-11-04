/**
 * Recordings: measure the tempo of recordings already published (Daniel 2026-11-03).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<key file> npx jiti scripts/recordings/tempo-backfill.ts            # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=<key file> npx jiti scripts/recordings/tempo-backfill.ts --write    # store tempo
 *     --org crc          tenant (default crc)
 *     --all              re-analyse recordings that already have a tempo
 *     --limit 20         only the first N to analyse
 *
 * For each of the tenant's recordings with no `tempo` (hidden ones too, for audit), it
 * downloads the file from Storage to a temp folder, runs `python -I scripts/recordings/tempo.py
 * analyse` (librosa; set PYTHON to pick the interpreter), and prints the result. A dry run
 * (the default) writes nothing; `--write` stores `tempo` on each recording doc. Nothing here
 * touches a bpm field: afterwards run the MCP tool `apply_recording_tempos` (dry run first,
 * then `dryRun: false, force: true`) to fill the empty ones.
 *
 * Credentials: the Admin SDK's application default credentials. This script never creates
 * or stores a credential.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Recording, RecordingTempo } from '../../src/types/models'

const BATCH = 20

export interface BackfillDeps {
    /** Every recording of the tenant. */
    listRecordings(): Promise<Recording[]>
    /** Download a Storage object to a local file; returns its path. */
    fetch(storagePath: string, dir: string): Promise<string>
    /** tempo.py over these files: path -> tempo (or an error string). */
    analyse(files: string[]): Map<string, RecordingTempo | { error: string }>
    update(id: string, tempo: RecordingTempo): Promise<void>
    now(): string
}

export interface BackfillRow {
    id: string
    songId: string | null
    status: string
    tempo?: RecordingTempo
    error?: string
}

export interface BackfillPlan {
    write: boolean
    analysed: BackfillRow[]
    alreadyMeasured: number
}

export async function backfill(
    deps: BackfillDeps,
    opts: { write: boolean; all?: boolean; limit?: number; dir: string },
): Promise<BackfillPlan> {
    const recs = await deps.listRecordings()
    const todo = recs.filter((r) => opts.all || !r.tempo).slice(0, opts.limit ?? Infinity)
    const plan: BackfillPlan = { write: opts.write, analysed: [], alreadyMeasured: recs.length - recs.filter((r) => !r.tempo).length }
    for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH)
        const files = new Map<string, Recording>()
        for (const r of batch) {
            try {
                files.set(await deps.fetch(r.storagePath, opts.dir), r)
            } catch (e) {
                plan.analysed.push({ id: r.id, songId: r.songId ?? null, status: r.status ?? 'live', error: `download failed: ${String(e)}` })
            }
        }
        const results = files.size ? deps.analyse([...files.keys()]) : new Map<string, RecordingTempo | { error: string }>()
        for (const [file, r] of files) {
            const got: RecordingTempo | { error: string } | undefined = results.get(file)
            const row: BackfillRow = { id: r.id, songId: r.songId ?? null, status: r.status ?? 'live' }
            if (!got || 'error' in got) row.error = got ? got.error : 'not analysed'
            else {
                const t: RecordingTempo = { ...got, analyzedAt: deps.now() }
                row.tempo = t
                if (opts.write) await deps.update(r.id, t)
            }
            plan.analysed.push(row)
            fs.rmSync(file, { force: true })
        }
    }
    return plan
}

export function formatPlan(plan: BackfillPlan): string {
    const tag = plan.write ? '' : '[dry-run] '
    const lines = plan.analysed.map((r) => {
        if (r.error) return `${tag}${r.id} song=${r.songId ?? '-'}: ${r.error}`
        const t = r.tempo!
        const what = t.confident ? `${t.bpm} BPM (alt ${t.alt})` : `skip: ${t.reason ?? 'not confident'}${t.bpm ? ` (~${t.bpm})` : ''}`
        return `${tag}${r.id} song=${r.songId ?? '-'} ${r.status} confidence=${t.confidence.toFixed(2)} ${what}`
    })
    const ok = plan.analysed.filter((r) => r.tempo)
    lines.push(
        `${tag}${ok.length} analysed (${ok.filter((r) => r.tempo!.confident).length} confident), ` +
            `${plan.analysed.length - ok.length} failed, ${plan.alreadyMeasured} already had a tempo.` +
            (plan.write ? ' Tempo stored on each analysed recording.' : ' Nothing was written.') +
            ' Next: apply_recording_tempos (dry run first).',
    )
    return lines.join('\n')
}

function runTempoPy(files: string[]): Map<string, RecordingTempo | { error: string }> {
    const py = process.env.PYTHON ?? 'python'
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tempo.py')
    const out = execFileSync(py, ['-I', script, 'analyse', ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const map = new Map<string, RecordingTempo | { error: string }>()
    for (const line of out.split('\n')) {
        if (!line.trim()) continue
        const d = JSON.parse(line) as { file: string; tempo?: RecordingTempo; error?: string }
        map.set(d.file, d.tempo ?? { error: d.error ?? 'no result' })
    }
    return map
}

async function adminDeps(org: string): Promise<BackfillDeps> {
    const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    const { getStorage } = await import('firebase-admin/storage')
    const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'crcmusiccharts'
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set (a dry run reads Firestore and Storage)')
    if (!getApps().length) {
        initializeApp({
            credential: applicationDefault(),
            projectId,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
        })
    }
    const col = getFirestore().collection('recordings')
    const bucket = getStorage().bucket()
    return {
        async listRecordings() {
            // A legacy doc with no orgId is crc's.
            const snap = org === 'crc' ? await col.get() : await col.where('orgId', '==', org).get()
            return snap.docs
                .map((d) => ({ ...(d.data() as Recording), id: d.id }))
                .filter((r) => (typeof r.orgId === 'string' && r.orgId ? r.orgId : 'crc') === org)
        },
        async fetch(storagePath, dir) {
            const dest = path.join(dir, storagePath.replace(/[\\/]/g, '_'))
            await bucket.file(storagePath).download({ destination: dest })
            return dest
        },
        analyse: runTempoPy,
        async update(id, tempo) {
            await col.doc(id).update({ tempo })
        },
        now: () => new Date().toISOString(),
    }
}

async function main(argv: string[]): Promise<void> {
    const arg = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
    const write = argv.includes('--write')
    const org = arg('--org') ?? 'crc'
    const limit = arg('--limit') ? Number(arg('--limit')) : undefined
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-tempo-'))
    try {
        const plan = await backfill(await adminDeps(org), { write, all: argv.includes('--all'), limit, dir })
        console.log(formatPlan(plan))
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    main(process.argv.slice(2)).catch((e) => {
        console.error(e)
        process.exit(1)
    })
}
