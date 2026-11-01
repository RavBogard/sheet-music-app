/**
 * Recordings ingest: publish the manifest's clips to Storage + the `recordings` collection.
 *
 * STUB for the pilot. The real publisher needs `pickFeatured` from
 * `src/lib/recordings/featured.ts` (PR A). Until that lands this script only reads the
 * manifest and prints the plan, and refuses to run without `--dry-run`.
 *
 *   npx jiti scripts/recordings/publish.ts --dry-run
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

interface ManifestRow {
    folder: string
    file: string
    mix: string | null
    serviceDate: string | null
    label: string
    setlistId: string | null
    songId: string | null
    title: string
    startSec: number
    endSec: number
    confidence: number
    status: 'live' | 'held' | 'dropped'
    clip: string | null
}

export function ingestKey(r: Pick<ManifestRow, 'folder' | 'file' | 'startSec' | 'endSec' | 'songId'>): string {
    return createHash('sha1').update([r.folder, r.file, r.startSec, r.endSec, r.songId].join('|')).digest('hex')
}

function main(argv: string[]): void {
    if (!argv.includes('--dry-run')) {
        console.error('publish.ts is a stub until PR A lands (featured.ts). Run with --dry-run.')
        process.exit(2)
    }
    const work = path.resolve(process.env.RECORDINGS_WORK ?? '.recordings-work')
    const manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'), 'utf8')) as ManifestRow[]
    const rows = manifest.filter((r) => r.status !== 'dropped' && r.songId && r.clip)
    for (const r of rows) {
        console.log(`[dry-run] ${r.status.padEnd(4)} ${ingestKey(r).slice(0, 10)} ${r.songId} "${r.label}" ${r.startSec}-${r.endSec}s ← ${r.clip}`)
    }
    console.log(`[dry-run] ${rows.length} clips would be written for orgId crc; nothing was written.`)
}

main(process.argv.slice(2))
