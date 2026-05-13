// One-shot Firestore backfill for v6.0 — migrates the 15 most-recent setlists
// from the legacy embedded `tracks[]` shape to the v6.0 single-source-of-truth
// shape: top-level `tracks/{id}` rows + denormalized parent-doc fields
// (`hydrated`, `trackCount`, `songCount`, `fileIds`).
//
// Final v60-06 plan — runs AFTER v60-06-01..07 closed every reader leakage
// point (server spine + client inventory + dashboard denorm). v60-07 strips
// the embedded-array writer; this backfill closes the historical-setlist
// surface so the matrix endpoint + dashboard surfaces have hydrated data for
// the 8-week window that Daniel actively uses.
//
// Run with: npx tsx scripts/backfill-tracks-v60.ts [--dry-run|--apply|--rollback|--force|--help]
//
// Each migrated setlist is snapshotted to migration_snapshots/{setlistId}
// BEFORE mutation. Rollback restores fields from the snapshot and deletes
// the top-level tracks rows scoped to the migrated setlistIds.
// Idempotency marker: system/v60TracksBackfill (apply blocked without --force
// once status='applied'; rollback blocked unless status='applied').

import * as dotenv from 'dotenv'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from './migrate-v50'

dotenv.config({ path: '.env.local' })

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const MARKER_PATH = 'system/v60TracksBackfill'
const SNAPSHOT_PREFIX = 'migration_snapshots'
const SETLISTS = 'setlists'
const TRACKS = 'tracks'
export const BACKFILL_LIMIT = 15

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface SetlistTrackLike {
    id?: string
    type?: string
    fileId?: string
    order?: number
    setlistId?: string
    [k: string]: unknown
}

interface SetlistDocLike {
    id?: string
    tracks?: SetlistTrackLike[]
    hydrated?: boolean
    trackCount?: number
    songCount?: number
    fileIds?: string[]
    updatedAt?: number | { toMillis?: () => number; seconds?: number }
    date?: number | { toMillis?: () => number; seconds?: number }
    [k: string]: unknown
}

interface SnapshotDocLike {
    prevHydrated?: boolean
    prevTrackCount?: number
    prevSongCount?: number
    prevFileIds?: string[]
    prevTracks: SetlistTrackLike[]
    snapshottedAt: number
}

interface MarkerDocLike {
    status: 'applied' | 'rolled-back'
    appliedAt?: number
    rolledBackAt?: number
    migratedSetlistIds?: string[]
}

export interface BackfillOpts {
    mode: 'apply' | 'dry-run' | 'rollback'
    force?: boolean
    log?: (msg: string) => void
    now?: () => number
}

export interface BackfillResult {
    mode: 'apply' | 'dry-run' | 'rollback'
    candidatesEvaluated: number
    migrated: number
    skippedHydrated: number
    skippedEmpty: number
    errors: string[]
    migratedIds: string[]
    skippedAlreadyApplied?: boolean
    skippedNothingToRollback?: boolean
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

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

export type Action = 'MIGRATE' | 'SKIP-HYDRATED' | 'SKIP-EMPTY'

export function classifyAction(setlist: SetlistDocLike): Action {
    if (setlist.hydrated === true) return 'SKIP-HYDRATED'
    if (!Array.isArray(setlist.tracks) || setlist.tracks.length === 0) {
        return 'SKIP-EMPTY'
    }
    return 'MIGRATE'
}

export function computeDenormFields(tracks: SetlistTrackLike[]): {
    trackCount: number
    songCount: number
    fileIds: string[]
} {
    const trackCount = tracks.length
    const songCount = tracks.filter(
        (t) => !t.type || t.type === 'song',
    ).length
    const fileIds = Array.from(
        new Set(
            tracks
                .map((t) => t.fileId)
                .filter(
                    (id): id is string =>
                        typeof id === 'string' && id.length > 0,
                ),
        ),
    ).sort()
    return { trackCount, songCount, fileIds }
}

async function selectCandidates(
    fs: MigrationFirestore,
): Promise<Array<MigrationDoc & { data: SetlistDocLike }>> {
    const all = (await fs.listCollection(SETLISTS)) as Array<
        MigrationDoc & { data: SetlistDocLike }
    >
    const sorted = all.slice().sort((a, b) => {
        const aMs = tsToMillis(a.data.date) ?? -Infinity
        const bMs = tsToMillis(b.data.date) ?? -Infinity
        return bMs - aMs
    })
    return sorted.slice(0, BACKFILL_LIMIT)
}

function formatDate(d: SetlistDocLike['date']): string {
    const ms = tsToMillis(d)
    if (ms === undefined) return 'no-date'
    return new Date(ms).toISOString().slice(0, 10)
}

// -------------------------------------------------------------------------
// Per-setlist apply step: snapshot → fan-out → setlist update
// -------------------------------------------------------------------------

async function applyOne(
    fs: MigrationFirestore,
    doc: MigrationDoc & { data: SetlistDocLike },
    now: number,
): Promise<void> {
    const setlist = doc.data
    const tracks = setlist.tracks ?? []

    // 1. Snapshot first — independent deep copy via JSON round-trip so the
    //    snapshot survives any later mutation of `tracks`. Optional fields
    //    are omitted when undefined (Firestore can't store undefined).
    const snapshot: SnapshotDocLike = {
        prevTracks: JSON.parse(JSON.stringify(tracks)) as SetlistTrackLike[],
        snapshottedAt: now,
    }
    if (setlist.hydrated !== undefined) snapshot.prevHydrated = setlist.hydrated
    if (setlist.trackCount !== undefined) {
        snapshot.prevTrackCount = setlist.trackCount
    }
    if (setlist.songCount !== undefined) {
        snapshot.prevSongCount = setlist.songCount
    }
    if (setlist.fileIds !== undefined) snapshot.prevFileIds = setlist.fileIds

    await fs.setDoc(
        `${SNAPSHOT_PREFIX}/${doc.id}`,
        snapshot as unknown as Record<string, unknown>,
    )

    // 2. Top-level tracks fan-out (matches SetlistGridHydrator cascade shape).
    const setlistUpdatedAt = tsToMillis(setlist.updatedAt) ?? now
    await Promise.all(
        tracks.map((t, index) => {
            const trackId =
                typeof t.id === 'string' && t.id.length > 0
                    ? t.id
                    : `${doc.id}-${index}`
            const trackDoc: Record<string, unknown> = {
                ...t,
                id: trackId,
                setlistId: doc.id,
                order: typeof t.order === 'number' ? t.order : index,
                updatedAt: setlistUpdatedAt,
            }
            return fs.setDoc(`${TRACKS}/${trackId}`, trackDoc)
        }),
    )

    // 3. Setlist denormalization update (4 fields exactly — matches
    //    SetlistGridHydrator.tsx:282-290 cascade seed shape).
    const denorm = computeDenormFields(tracks)
    await fs.updateDoc(`${SETLISTS}/${doc.id}`, {
        hydrated: true,
        trackCount: denorm.trackCount,
        songCount: denorm.songCount,
        fileIds: denorm.fileIds,
    })
}

// -------------------------------------------------------------------------
// Per-setlist rollback step
// -------------------------------------------------------------------------

async function rollbackOne(
    fs: MigrationFirestore,
    setlistId: string,
    log: (m: string) => void,
): Promise<boolean> {
    const snapRes = await fs.getDoc(`${SNAPSHOT_PREFIX}/${setlistId}`)
    if (!snapRes.exists || !snapRes.data) {
        log(`  [ERROR-MISSING-SNAPSHOT] ${setlistId}`)
        return false
    }
    const snap = snapRes.data as unknown as SnapshotDocLike

    // Restore the 4 denormalization fields. Undefined-in-snapshot ⇒
    // the field didn't exist pre-apply ⇒ delete via sentinel.
    const restorePatch: Record<string, unknown> = {
        hydrated:
            snap.prevHydrated === undefined
                ? FIELD_DELETE_SENTINEL
                : snap.prevHydrated,
        trackCount:
            snap.prevTrackCount === undefined
                ? FIELD_DELETE_SENTINEL
                : snap.prevTrackCount,
        songCount:
            snap.prevSongCount === undefined
                ? FIELD_DELETE_SENTINEL
                : snap.prevSongCount,
        fileIds:
            snap.prevFileIds === undefined
                ? FIELD_DELETE_SENTINEL
                : snap.prevFileIds,
    }
    await fs.updateDoc(`${SETLISTS}/${setlistId}`, restorePatch)

    // Delete top-level tracks scoped to this setlistId.
    const allTracks = (await fs.listCollection(TRACKS)) as Array<
        MigrationDoc & { data: { setlistId?: string } }
    >
    const toDelete = allTracks.filter((t) => t.data.setlistId === setlistId)
    await Promise.all(toDelete.map((t) => fs.deleteDoc(`${TRACKS}/${t.id}`)))

    return true
}

// -------------------------------------------------------------------------
// Core
// -------------------------------------------------------------------------

export async function runBackfill(
    fs: MigrationFirestore,
    opts: BackfillOpts,
): Promise<BackfillResult> {
    const log = opts.log ?? ((m: string) => console.log(m))
    const now = opts.now ?? (() => Date.now())

    const empty: BackfillResult = {
        mode: opts.mode,
        candidatesEvaluated: 0,
        migrated: 0,
        skippedHydrated: 0,
        skippedEmpty: 0,
        errors: [],
        migratedIds: [],
    }

    // ----- ROLLBACK -----
    if (opts.mode === 'rollback') {
        const marker = await fs.getDoc(MARKER_PATH)
        if (!marker.exists && !opts.force) {
            log('[v60-backfill] No marker doc — nothing to roll back. Use --force to override.')
            return { ...empty, skippedNothingToRollback: true }
        }
        const markerData = (marker.data ?? {}) as unknown as MarkerDocLike
        if (markerData.status !== 'applied' && !opts.force) {
            log(
                `[v60-backfill] Marker status is '${markerData.status ?? 'unknown'}' — refusing rollback. Use --force to override.`,
            )
            return { ...empty, skippedNothingToRollback: true }
        }
        const setlistIds = markerData.migratedSetlistIds ?? []
        let rolledBackCount = 0
        const errors: string[] = []
        for (const setlistId of setlistIds) {
            const ok = await rollbackOne(fs, setlistId, log)
            if (ok) rolledBackCount += 1
            else errors.push(`missing-snapshot:${setlistId}`)
        }
        await fs.setDoc(MARKER_PATH, {
            status: 'rolled-back',
            appliedAt: markerData.appliedAt,
            rolledBackAt: now(),
            migratedSetlistIds: setlistIds,
        })
        log(
            `[v60-backfill] ROLLBACK complete: ${rolledBackCount}/${setlistIds.length} setlists restored.`,
        )
        return {
            mode: 'rollback',
            candidatesEvaluated: setlistIds.length,
            migrated: 0,
            skippedHydrated: 0,
            skippedEmpty: 0,
            errors,
            migratedIds: setlistIds.slice(0, rolledBackCount),
        }
    }

    // ----- APPLY idempotency check -----
    if (opts.mode === 'apply') {
        const marker = await fs.getDoc(MARKER_PATH)
        const markerData = (marker.data ?? {}) as unknown as MarkerDocLike
        if (
            marker.exists &&
            markerData.status === 'applied' &&
            !opts.force
        ) {
            log(
                `[v60-backfill] Already applied at ${String(markerData.appliedAt ?? '?')} — skipping. Use --force to re-run.`,
            )
            return { ...empty, skippedAlreadyApplied: true }
        }
    }

    // ----- DRY-RUN + APPLY shared selection + classification -----
    const candidates = await selectCandidates(fs)
    const logPrefix = opts.mode === 'dry-run' ? '[DRY-RUN]' : '[APPLY]'
    log(`${logPrefix} backfill-tracks-v60 starting...`)

    let migrated = 0
    let skippedHydrated = 0
    let skippedEmpty = 0
    const errors: string[] = []
    const migratedIds: string[] = []

    for (const doc of candidates) {
        const setlist = doc.data
        const action = classifyAction(setlist)
        const date = formatDate(setlist.date)
        const trackCount = Array.isArray(setlist.tracks)
            ? setlist.tracks.length
            : 0
        const songCount = Array.isArray(setlist.tracks)
            ? setlist.tracks.filter((t) => !t.type || t.type === 'song')
                  .length
            : 0

        if (action === 'SKIP-HYDRATED') {
            skippedHydrated += 1
            log(`  [SKIP-HYDRATED] ${doc.id} (${date}) — already hydrated`)
            continue
        }
        if (action === 'SKIP-EMPTY') {
            skippedEmpty += 1
            log(`  [SKIP-EMPTY] ${doc.id} (${date}) — no embedded tracks`)
            continue
        }

        // MIGRATE branch
        log(
            `  [MIGRATE] ${doc.id} (${date}) — ${trackCount} tracks, ${songCount} songs`,
        )
        if (opts.mode === 'dry-run') {
            migrated += 1
            migratedIds.push(doc.id)
            continue
        }

        try {
            await applyOne(fs, doc, now())
            migrated += 1
            migratedIds.push(doc.id)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            log(`  [ERROR-APPLY] ${doc.id}: ${msg}`)
            errors.push(`${doc.id}:${msg}`)
        }
    }

    log(
        `Total candidates: ${candidates.length} / Migrate: ${migrated} / Skip-hydrated: ${skippedHydrated} / Skip-empty: ${skippedEmpty}`,
    )

    if (opts.mode === 'dry-run') {
        log('[DRY-RUN] No mutations performed. Run with --apply to migrate.')
        return {
            mode: 'dry-run',
            candidatesEvaluated: candidates.length,
            migrated,
            skippedHydrated,
            skippedEmpty,
            errors,
            migratedIds,
        }
    }

    // APPLY: write marker
    await fs.setDoc(MARKER_PATH, {
        status: 'applied',
        appliedAt: now(),
        migratedSetlistIds: migratedIds,
    })
    log(
        `[APPLY] complete: ${migrated} setlists migrated (${errors.length} errors).`,
    )
    return {
        mode: 'apply',
        candidatesEvaluated: candidates.length,
        migrated,
        skippedHydrated,
        skippedEmpty,
        errors,
        migratedIds,
    }
}

// -------------------------------------------------------------------------
// CLI entry point
// -------------------------------------------------------------------------

function parseArgs(argv: string[]): {
    mode: 'apply' | 'dry-run' | 'rollback' | 'help'
    force: boolean
} {
    if (argv.includes('--help') || argv.includes('-h')) {
        return { mode: 'help', force: false }
    }
    const force = argv.includes('--force')
    if (argv.includes('--rollback')) return { mode: 'rollback', force }
    if (argv.includes('--apply')) return { mode: 'apply', force }
    // Default is dry-run for safety (script may write to PRODUCTION on --apply).
    return { mode: 'dry-run', force }
}

function printHelp(): void {
    console.log(`backfill-tracks-v60 — 15-setlist top-level tracks + denormalization backfill (v6.0 phase v60-06-08)

Usage:
  npx tsx scripts/backfill-tracks-v60.ts              Dry-run (default; read-only)
  npx tsx scripts/backfill-tracks-v60.ts --dry-run    Explicit dry-run
  npx tsx scripts/backfill-tracks-v60.ts --apply      Apply (writes to PRODUCTION Firestore)
  npx tsx scripts/backfill-tracks-v60.ts --rollback   Restore from migration_snapshots and delete top-level tracks
  npx tsx scripts/backfill-tracks-v60.ts --force      Re-run apply even if marker exists, OR rollback without prior apply marker
  npx tsx scripts/backfill-tracks-v60.ts --help       Show this help

Idempotency marker: system/v60TracksBackfill
Snapshot collection: migration_snapshots/{setlistId}
Cap: ${BACKFILL_LIMIT} most-recent setlists by date DESC.

Reference: .paul/phases/v60-06-dashboard-reader-migration/v60-06-08-PLAN.md
`)
}

async function main(): Promise<void> {
    const { mode, force } = parseArgs(process.argv.slice(2))
    if (mode === 'help') {
        printHelp()
        return
    }

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
                '[v60-backfill] Missing Firebase Admin credentials in .env.local — aborting.',
            )
            process.exit(1)
        }
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
        })
    }
    const db = getFirestore()

    const adapter: MigrationFirestore = {
        async getDoc(path) {
            const snap = await db.doc(path).get()
            return {
                exists: snap.exists,
                data: snap.exists
                    ? (snap.data() as Record<string, unknown>)
                    : null,
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
                remapped[k] =
                    v === FIELD_DELETE_SENTINEL ? FieldValue.delete() : v
            }
            await db.doc(path).update(remapped)
        },
        async deleteDoc(path) {
            await db.doc(path).delete()
        },
    }

    const result = await runBackfill(adapter, { mode, force })
    console.log(`\n[v60-backfill] Result: ${JSON.stringify(result, null, 2)}`)
    process.exit(result.errors.length > 0 ? 1 : 0)
}

if (
    typeof require !== 'undefined' &&
    require.main === module
) {
    void main()
}
