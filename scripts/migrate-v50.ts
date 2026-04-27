// One-shot Firestore migration for v50-04 sticky song memory.
// Bound by ARCHITECTURE.md §5.
// Run with: npx tsx scripts/migrate-v50.ts [--dry-run|--force|--rollback|--help]

import * as crypto from 'crypto'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// -------------------------------------------------------------------------
// Abstract Firestore interface — keeps the migration core testable with an
// in-memory fake. The CLI entry point wires this to firebase-admin.
// -------------------------------------------------------------------------

export interface MigrationDoc {
    id: string
    data: Record<string, unknown>
}

export interface MigrationFirestore {
    getDoc(path: string): Promise<{ exists: boolean; data: Record<string, unknown> | null }>
    listCollection(path: string): Promise<MigrationDoc[]>
    setDoc(path: string, data: Record<string, unknown>): Promise<void>
    updateDoc(path: string, data: Record<string, unknown>): Promise<void>
    deleteDoc(path: string): Promise<void>
}

export interface MigrationOpts {
    mode: 'apply' | 'dry-run' | 'rollback'
    force?: boolean
    log?: (msg: string) => void
    now?: () => number
}

interface SetlistTrackLike {
    songId?: string
    fileId?: string
    key?: string
    leadMusician?: string
    bpm?: number
}

interface SetlistDocLike {
    id: string
    eventDate?: number | { toMillis?: () => number; seconds?: number }
    date?: number | { toMillis?: () => number; seconds?: number }
    tracks?: SetlistTrackLike[]
    [k: string]: unknown
}

interface PerSongRecord {
    key?: string
    lead?: string
    bpm?: number
    setlistId: string
    performedAt: number
}

// 2-segment Firestore doc path. Previous value 'system/migrations/v50' was a
// 3-segment collection path and threw on db.doc() against real Firestore
// (caught in v50-07-01 audit; tests use a fake adapter that does not validate
// path structure, so the bug never surfaced before).
const MARKER_PATH = 'system/v50Migration'
const SNAPSHOT_COLLECTION = 'migrations/v50/snapshot'
const RECENT_CAP = 5

function tsToMillis(
    v: number | { toMillis?: () => number; seconds?: number } | undefined,
): number | undefined {
    if (v === undefined || v === null) return undefined
    if (typeof v === 'number') return v
    if (typeof v === 'object' && typeof v.toMillis === 'function') {
        return v.toMillis()
    }
    if (typeof v === 'object' && typeof v.seconds === 'number') {
        return v.seconds * 1000
    }
    return undefined
}

function hashSetlist(doc: MigrationDoc): string {
    const sorted = JSON.stringify(doc.data, Object.keys(doc.data).sort())
    return crypto.createHash('sha256').update(`${doc.id}:${sorted}`).digest('hex')
}

function trackHasMemoryFields(t: SetlistTrackLike): boolean {
    return (
        typeof t.key === 'string' ||
        typeof t.leadMusician === 'string' ||
        typeof t.bpm === 'number'
    )
}

function recordFromTrack(
    t: SetlistTrackLike,
    setlistId: string,
    performedAt: number,
): PerSongRecord {
    const r: PerSongRecord = { setlistId, performedAt }
    if (typeof t.key === 'string') r.key = t.key
    if (typeof t.leadMusician === 'string') r.lead = t.leadMusician
    if (typeof t.bpm === 'number') r.bpm = t.bpm
    return r
}

// Compute new defaults: most-recent record per field wins. records ordered ASC
// (oldest first) — last entry wins per field.
function computeDefaults(records: PerSongRecord[]): {
    key?: string
    lead?: string
    bpm?: number
} {
    const out: { key?: string; lead?: string; bpm?: number } = {}
    for (const r of records) {
        if (r.key !== undefined) out.key = r.key
        if (r.lead !== undefined) out.lead = r.lead
        if (r.bpm !== undefined) out.bpm = r.bpm
    }
    return out
}

function computeRecent(records: PerSongRecord[]): PerSongRecord[] {
    // Latest-first, capped at RECENT_CAP.
    return [...records].reverse().slice(0, RECENT_CAP)
}

export interface MigrationResult {
    mode: 'apply' | 'dry-run' | 'rollback'
    affectedSongCount: number
    skippedAlreadyApplied?: boolean
    setlistInvariant?: boolean
}

export async function runMigration(
    fs: MigrationFirestore,
    opts: MigrationOpts,
): Promise<MigrationResult> {
    const log = opts.log ?? ((m: string) => console.log(m))
    const now = opts.now ?? (() => Date.now())

    if (opts.mode === 'rollback') {
        return rollback(fs, log)
    }

    // Idempotency check
    const marker = await fs.getDoc(MARKER_PATH)
    if (marker.exists && !opts.force) {
        log(
            `[v50] Already applied at ${String(marker.data?.appliedAt ?? '?')} — skipping. Use --force to re-run.`,
        )
        return {
            mode: opts.mode,
            affectedSongCount: 0,
            skippedAlreadyApplied: true,
        }
    }

    // Read all setlists
    const setlists = (await fs.listCollection('setlists')) as Array<
        MigrationDoc & { data: SetlistDocLike }
    >

    // Pre-state hash of every setlist (for invariance check)
    const preHashes = new Map<string, string>()
    for (const s of setlists) preHashes.set(s.id, hashSetlist(s))

    // Sort setlists ASC by (eventDate || date)
    setlists.sort((a, b) => {
        const ax =
            tsToMillis(a.data.eventDate) ?? tsToMillis(a.data.date) ?? 0
        const bx =
            tsToMillis(b.data.eventDate) ?? tsToMillis(b.data.date) ?? 0
        return ax - bx
    })

    // Build per-song accumulator (records ordered ASC by performedAt)
    const accum = new Map<string, PerSongRecord[]>()
    for (const s of setlists) {
        const performedAt =
            tsToMillis(s.data.eventDate) ??
            tsToMillis(s.data.date) ??
            0
        const tracks = Array.isArray(s.data.tracks) ? s.data.tracks : []
        for (const t of tracks) {
            const songId = t.songId
            if (typeof songId !== 'string' || songId.length === 0) continue
            if (!trackHasMemoryFields(t)) continue
            const list = accum.get(songId) ?? []
            list.push(recordFromTrack(t, s.id, performedAt))
            accum.set(songId, list)
        }
    }

    // Filter out songIds that don't exist in songs/* (orphan track refs).
    // Done up-front so dry-run reports accurate counts.
    const candidateIds = [...accum.keys()]
    const affectedSongIds: string[] = []
    for (const id of candidateIds) {
        const songDoc = await fs.getDoc(`songs/${id}`)
        if (songDoc.exists) affectedSongIds.push(id)
    }

    if (opts.mode === 'dry-run') {
        log(`[v50] DRY-RUN: ${affectedSongIds.length} songs would be touched.`)
        const sample = affectedSongIds.slice(0, 3)
        for (const id of sample) {
            const records = accum.get(id) ?? []
            const defaults = computeDefaults(records)
            const recent = computeRecent(records)
            log(
                `[DRY] songs/${id} ← defaults=${JSON.stringify(defaults)}, recent=[${recent.length} entries]`,
            )
        }
        if (affectedSongIds.length > 3) {
            log(`[DRY] ... + ${affectedSongIds.length - 3} more`)
        }
        return {
            mode: 'dry-run',
            affectedSongCount: affectedSongIds.length,
            setlistInvariant: true,
        }
    }

    // APPLY mode
    let written = 0
    for (const songId of affectedSongIds) {
        const records = accum.get(songId)!
        const songDoc = await fs.getDoc(`songs/${songId}`)
        if (!songDoc.exists) continue

        // Snapshot existing defaults + recent
        const snapshot = {
            defaults: songDoc.data?.defaults ?? null,
            recent: songDoc.data?.recent ?? null,
            snapshottedAt: now(),
        }
        await fs.setDoc(`${SNAPSHOT_COLLECTION}/${songId}`, snapshot)

        // Compute and write
        const defaults = computeDefaults(records)
        const recent = computeRecent(records)
        await fs.updateDoc(`songs/${songId}`, { defaults, recent })
        written += 1
    }

    // Setlist invariance check (post-state)
    const setlistsPost = (await fs.listCollection('setlists')) as Array<
        MigrationDoc & { data: SetlistDocLike }
    >
    let invariant = true
    for (const s of setlistsPost) {
        const post = hashSetlist(s)
        const pre = preHashes.get(s.id)
        if (pre !== post) {
            invariant = false
            log(
                `[v50] FATAL: setlists/${s.id} hash mismatch — migration mutated a setlist doc.`,
            )
        }
    }
    if (!invariant) {
        throw new Error('Setlist invariance violated — aborting migration')
    }

    // Mark complete
    await fs.setDoc(MARKER_PATH, {
        appliedAt: now(),
        affectedSongCount: written,
    })

    log(
        `[v50] APPLY complete: ${written} songs touched (of ${affectedSongIds.length} candidates).`,
    )
    return {
        mode: 'apply',
        affectedSongCount: written,
        setlistInvariant: true,
    }
}

async function rollback(
    fs: MigrationFirestore,
    log: (m: string) => void,
): Promise<MigrationResult> {
    const snapshots = await fs.listCollection(SNAPSHOT_COLLECTION)
    let restored = 0
    for (const snap of snapshots) {
        const songId = snap.id
        const defaults = snap.data?.defaults
        const recent = snap.data?.recent
        const songDoc = await fs.getDoc(`songs/${songId}`)
        if (!songDoc.exists) continue

        const patch: Record<string, unknown> = {}
        // Use a sentinel to delete fields. The CLI adapter maps this to
        // FieldValue.delete(); the test fake inspects the sentinel directly.
        patch.defaults = defaults === null ? FIELD_DELETE_SENTINEL : defaults
        patch.recent = recent === null ? FIELD_DELETE_SENTINEL : recent
        await fs.updateDoc(`songs/${songId}`, patch)
        restored += 1
    }

    await fs.deleteDoc(MARKER_PATH).catch(() => {})

    log(`[v50] ROLLBACK complete: ${restored} songs restored.`)
    return { mode: 'rollback', affectedSongCount: restored }
}

export const FIELD_DELETE_SENTINEL = Symbol.for('v50.field.delete')

// -------------------------------------------------------------------------
// CLI entry point — wires the abstract interface to firebase-admin SDK.
// -------------------------------------------------------------------------

function parseArgs(argv: string[]): {
    mode: 'apply' | 'dry-run' | 'rollback' | 'help'
    force: boolean
} {
    if (argv.includes('--help') || argv.includes('-h')) {
        return { mode: 'help', force: false }
    }
    if (argv.includes('--rollback')) {
        return { mode: 'rollback', force: false }
    }
    if (argv.includes('--dry-run')) {
        return { mode: 'dry-run', force: argv.includes('--force') }
    }
    return { mode: 'apply', force: argv.includes('--force') }
}

function printHelp(): void {
    console.log(`migrate-v50 — backfill song defaults from setlist history (v50-04)

Usage:
  npx tsx scripts/migrate-v50.ts                Apply migration
  npx tsx scripts/migrate-v50.ts --dry-run      Enumerate planned changes; no writes
  npx tsx scripts/migrate-v50.ts --force        Re-run even if marker exists
  npx tsx scripts/migrate-v50.ts --rollback     Restore from migrations/v50/snapshot/*
  npx tsx scripts/migrate-v50.ts --help         Show this help

Reference: ARCHITECTURE.md §5.
`)
}

async function main(): Promise<void> {
    const { mode, force } = parseArgs(process.argv.slice(2))
    if (mode === 'help') {
        printHelp()
        return
    }

    // Lazy-import firebase-admin so tests don't need credentials.
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getFirestore, FieldValue } = await import(
        'firebase-admin/firestore'
    )

    if (getApps().length === 0) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
            /\\n/g,
            '\n',
        )
        if (!projectId || !clientEmail || !privateKey) {
            console.error(
                '[v50] Missing Firebase Admin credentials in .env.local — aborting.',
            )
            process.exit(1)
        }
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    }
    const db = getFirestore()

    const adapter: MigrationFirestore = {
        async getDoc(path) {
            const snap = await db.doc(path).get()
            return {
                exists: snap.exists,
                data: snap.exists ? (snap.data() as Record<string, unknown>) : null,
            }
        },
        async listCollection(path) {
            const snap = await db.collection(path).get()
            return snap.docs.map((d) => ({
                id: d.id,
                data: d.data() as Record<string, unknown>,
            }))
        },
        async setDoc(path, data) {
            await db.doc(path).set(data)
        },
        async updateDoc(path, data) {
            const remapped: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(data)) {
                remapped[k] = v === FIELD_DELETE_SENTINEL ? FieldValue.delete() : v
            }
            await db.doc(path).update(remapped)
        },
        async deleteDoc(path) {
            await db.doc(path).delete()
        },
    }

    const result = await runMigration(adapter, { mode, force })
    if (mode === 'apply' && !result.skippedAlreadyApplied) {
        console.log(
            `[v50] Done. ${result.affectedSongCount} song docs updated.`,
        )
    }
}

// Only run when invoked directly (not when imported by tests).
const isMainModule =
    typeof require !== 'undefined' && require.main === module
if (isMainModule) {
    main().catch((err) => {
        console.error('[v50] FATAL:', err)
        process.exit(1)
    })
}
