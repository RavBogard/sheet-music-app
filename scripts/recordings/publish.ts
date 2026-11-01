/**
 * Recordings ingest: publish the manifest's clips to Storage and the `recordings` collection.
 *
 *   npx jiti scripts/recordings/publish.ts --dry-run          # full plan, writes nothing
 *   GOOGLE_APPLICATION_CREDENTIALS=<key file> npx jiti scripts/recordings/publish.ts
 *
 * Reads .recordings-work/manifest.json. For each live or held row with a chart, from a
 * service that matched a real setlist (Daniel 2026-11-01: services without a setlist are
 * skipped; the library-only matcher never publishes):
 *   - ingestKey = sha1(folder|file|startSec|endSec|songId); a row whose key already exists
 *     is skipped, so a re-run never duplicates a doc or a file;
 *   - the clip goes to recordings/<newId>.mp3 (contentType audio/mpeg);
 *   - the doc is written with orgId 'crc', status, featured:false, source, ingestKey.
 * Then each touched song with no explicitly featured take gets `featured: true` on its
 * pickFeatured() take (playable only, so a song with only held takes stays unfeatured).
 *
 * Credentials: the Admin SDK's application default credentials, from
 * GOOGLE_APPLICATION_CREDENTIALS. This script never creates or stores a credential.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { pickFeatured } from '../../src/lib/recordings/featured'
import type { Recording, RecordingSource, RecordingStatus } from '../../src/types/models'

export const ORG_ID = 'crc'
const IN_CHUNK = 30

export interface ManifestRow {
    folder: string
    file: string
    mix: string | null
    serviceDate: string | null
    label: string
    setlistId: string | null
    setlistState?: string
    songId: string | null
    title: string
    startSec: number
    endSec: number
    confidence: number
    status: 'live' | 'held' | 'dropped'
    reason?: string
    clip: string | null
}

/** The slice of the Admin SDK this script uses; tests pass fakes. */
export interface DocSnap {
    id: string
    data(): Record<string, unknown>
}
export interface PublishDeps {
    /** Existing recordings with any of these ingest keys (orgId crc). */
    findByIngestKeys(keys: string[]): Promise<string[]>
    /** Every CRC recording of these songs. */
    recordingsForSongs(songIds: string[]): Promise<Recording[]>
    newId(): string
    readClip(relPath: string): Buffer
    upload(storagePath: string, bytes: Buffer, contentType: string): Promise<void>
    writeDoc(id: string, doc: Recording): Promise<void>
    setFeatured(id: string): Promise<void>
    now(): string
}

export interface PublishPlan {
    dryRun: boolean
    toWrite: Array<{ id: string; ingestKey: string; songId: string; status: RecordingStatus; title: string; clip: string; bytes: number }>
    skippedExisting: Array<{ ingestKey: string; songId: string; clip: string }>
    skippedOther: Array<{ clip: string | null; why: string }>
    featured: Array<{ songId: string; recordingId: string }>
    bytes: number
}

export function ingestKey(r: Pick<ManifestRow, 'folder' | 'file' | 'startSec' | 'endSec' | 'songId'>): string {
    return createHash('sha1').update([r.folder, r.file, r.startSec, r.endSec, r.songId].join('|')).digest('hex')
}

/** "Shir Shabbat, Jun 19, 2026" — the manifest's label; the clip title the musician sees. */
export function clipTitle(r: ManifestRow): string {
    return r.label
}

function chunks<T>(xs: T[], n = IN_CHUNK): T[][] {
    const out: T[][] = []
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
    return out
}

export function publishable(r: ManifestRow): string | null {
    if (r.status !== 'live' && r.status !== 'held') return `status ${r.status}`
    if (!r.songId) return 'no chart'
    if (!r.clip) return 'no clip'
    if (r.setlistState !== undefined && r.setlistState !== 'matched') return 'service has no setlist'
    return null
}

export async function publish(manifest: ManifestRow[], deps: PublishDeps, opts: { dryRun: boolean }): Promise<PublishPlan> {
    const plan: PublishPlan = { dryRun: opts.dryRun, toWrite: [], skippedExisting: [], skippedOther: [], featured: [], bytes: 0 }
    const rows: Array<ManifestRow & { key: string }> = []
    const seenKeys = new Set<string>()
    for (const r of manifest) {
        const why = publishable(r)
        if (why) {
            if (r.status !== 'dropped') plan.skippedOther.push({ clip: r.clip ?? r.folder, why: r.reason?.startsWith('skipped') ? r.reason : why })
            continue
        }
        const key = ingestKey(r)
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        rows.push({ ...r, key })
    }
    const existing = new Set<string>()
    for (const c of chunks(rows.map((r) => r.key))) for (const k of await deps.findByIngestKeys(c)) existing.add(k)

    const created: Recording[] = []
    for (const r of rows) {
        if (existing.has(r.key)) {
            plan.skippedExisting.push({ ingestKey: r.key, songId: r.songId!, clip: r.clip! })
            continue
        }
        const bytes = deps.readClip(r.clip!)
        const id = deps.newId()
        const storagePath = `recordings/${id}.mp3`
        const source: RecordingSource = {
            file: r.file,
            serviceDate: r.serviceDate ?? '',
            startSec: r.startSec,
            endSec: r.endSec,
            confidence: r.confidence,
            ...(r.mix ? { mix: r.mix } : {}),
            ...(r.setlistId ? { setlistId: r.setlistId } : {}),
            folder: r.folder,
        }
        const doc: Recording = {
            id,
            orgId: ORG_ID,
            songId: r.songId!,
            title: clipTitle(r),
            fileName: path.posix.basename(r.clip!),
            mimeType: 'audio/mpeg',
            storagePath,
            createdAt: deps.now(),
            createdBy: 'ingest',
            status: r.status as RecordingStatus,
            featured: false,
            source,
            ingestKey: r.key,
        }
        plan.toWrite.push({ id, ingestKey: r.key, songId: r.songId!, status: doc.status!, title: doc.title, clip: r.clip!, bytes: bytes.length })
        plan.bytes += bytes.length
        created.push(doc)
        if (!opts.dryRun) {
            await deps.upload(storagePath, bytes, 'audio/mpeg')
            await deps.writeDoc(id, doc)
        }
    }

    // Featured: each touched song with no explicitly featured take gets its best playable take.
    const touched = [...new Set(created.map((d) => d.songId!))]
    const bySong = new Map<string, Recording[]>()
    for (const c of chunks(touched)) {
        for (const rec of await deps.recordingsForSongs(c)) {
            if (!rec.songId) continue
            bySong.set(rec.songId, [...(bySong.get(rec.songId) ?? []), rec])
        }
    }
    for (const d of created) {
        const list = bySong.get(d.songId!) ?? []
        if (!list.some((x) => x.id === d.id)) bySong.set(d.songId!, [...list, d]) // dry run: not in Firestore yet
    }
    for (const songId of touched) {
        const recs = bySong.get(songId) ?? []
        if (recs.some((r) => r.featured === true)) continue
        const pick = pickFeatured(recs)
        if (!pick) continue // only held takes: no featured take, no ♫
        plan.featured.push({ songId, recordingId: pick.id })
        if (!opts.dryRun) await deps.setFeatured(pick.id)
    }
    return plan
}

export function formatPlan(plan: PublishPlan): string {
    const lines: string[] = []
    const tag = plan.dryRun ? '[dry-run] ' : ''
    for (const w of plan.toWrite) {
        lines.push(`${tag}write ${w.status.padEnd(4)} ${w.id} song=${w.songId} key=${w.ingestKey.slice(0, 10)} ${(w.bytes / 1e6).toFixed(2)} MB "${w.title}" <- ${w.clip}`)
    }
    for (const s of plan.skippedExisting) lines.push(`${tag}skip (ingestKey exists) ${s.ingestKey.slice(0, 10)} song=${s.songId} <- ${s.clip}`)
    for (const s of plan.skippedOther) lines.push(`${tag}skip (${s.why}) <- ${s.clip ?? '-'}`)
    for (const f of plan.featured) lines.push(`${tag}feature ${f.recordingId} for song=${f.songId}`)
    const live = plan.toWrite.filter((w) => w.status === 'live').length
    lines.push(
        `${tag}${plan.toWrite.length} docs (${live} live, ${plan.toWrite.length - live} held) and ${plan.toWrite.length} files, ` +
            `${(plan.bytes / 1e6).toFixed(1)} MB (${plan.bytes} bytes) for orgId ${ORG_ID}; ` +
            `${plan.skippedExisting.length} already published; ${plan.featured.length} songs get a featured take.` +
            (plan.dryRun ? ' Nothing was written.' : ''),
    )
    return lines.join('\n')
}

async function adminDeps(work: string, dryRun: boolean): Promise<PublishDeps> {
    const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    const { getStorage } = await import('firebase-admin/storage')
    const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'crcmusiccharts'
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set (a dry run needs read access too)')
    }
    if (!getApps().length) {
        initializeApp({
            credential: applicationDefault(),
            projectId,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
        })
    }
    const db = getFirestore()
    const bucket = getStorage().bucket()
    const col = db.collection('recordings')
    return {
        async findByIngestKeys(keys) {
            const snap = await col.where('orgId', '==', ORG_ID).where('ingestKey', 'in', keys).get()
            return snap.docs.map((d) => d.get('ingestKey') as string)
        },
        async recordingsForSongs(songIds) {
            const snap = await col.where('orgId', '==', ORG_ID).where('songId', 'in', songIds).get()
            return snap.docs.map((d) => ({ ...(d.data() as Recording), id: d.id }))
        },
        newId: () => col.doc().id,
        readClip: (rel) => fs.readFileSync(path.join(work, rel)),
        async upload(storagePath, bytes, contentType) {
            if (dryRun) throw new Error('upload in dry run')
            await bucket.file(storagePath).save(bytes, {
                resumable: false,
                metadata: { contentType, cacheControl: 'public, max-age=86400, s-maxage=604800', metadata: { source: 'ingest' } },
            })
        },
        async writeDoc(id, doc) {
            if (dryRun) throw new Error('write in dry run')
            await col.doc(id).set(doc)
        },
        async setFeatured(id) {
            if (dryRun) throw new Error('write in dry run')
            await col.doc(id).update({ featured: true })
        },
        now: () => new Date().toISOString(),
    }
}

/** Dry run without credentials: assumes nothing is published yet and says so. */
function offlineDeps(work: string): PublishDeps {
    let n = 0
    return {
        findByIngestKeys: async () => [],
        recordingsForSongs: async () => [],
        newId: () => `planned-${String(++n).padStart(3, '0')}`,
        readClip: (rel) => fs.readFileSync(path.join(work, rel)),
        upload: async () => { throw new Error('offline deps never upload') },
        writeDoc: async () => { throw new Error('offline deps never write') },
        setFeatured: async () => { throw new Error('offline deps never write') },
        now: () => new Date().toISOString(),
    }
}

async function main(argv: string[]): Promise<void> {
    const dryRun = argv.includes('--dry-run')
    const work = path.resolve(process.env.RECORDINGS_WORK ?? '.recordings-work')
    const manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'), 'utf8')) as ManifestRow[]
    let deps: PublishDeps
    if (dryRun && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('[dry-run] no GOOGLE_APPLICATION_CREDENTIALS: not checking Firestore for already-published keys')
        deps = offlineDeps(work)
    } else {
        deps = await adminDeps(work, dryRun)
    }
    console.log(formatPlan(await publish(manifest, deps, { dryRun })))
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    main(process.argv.slice(2)).catch((e) => {
        console.error(e)
        process.exit(1)
    })
}
