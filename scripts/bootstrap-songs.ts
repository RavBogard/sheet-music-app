// One-shot Firestore bootstrap for v5.4 — populates songs/* from library_index
// and back-stitches songId onto setlist tracks where track.fileId matches.
//
// Closes the deferred v50-07-02b sub-phase (DRY-RUN-REPORT.md:189-207). The
// new v50-05 spreadsheet editor's `+ Song` picker reads from songs/* (via
// primeSongsLibrary → Dexie); v50-04 introduced songs/* as a first-class
// catalog but left bootstrapping to a follow-up that never shipped. v53-02-01
// SUMMARY §212 explicitly flagged the empty-collection failure mode; this
// script fills it.
//
// Run with: npx tsx scripts/bootstrap-songs.ts [--dry-run|--apply|--rollback|--no-backstitch|--force|--help]
//
// Idempotent: marker doc system/v54SongsBootstrap blocks accidental re-apply
// (use --force to override). Rollback is sticky-memory-safe — docs that have
// gained defaults/recent post-bootstrap are preserved.

import * as dotenv from 'dotenv'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from './migrate-v50'

dotenv.config({ path: '.env.local' })

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface LibraryIndexDocLike {
    name?: string
    status?: string
    mimeType?: string
    [k: string]: unknown
}

// Library_index contains every Drive entity in the synced folders — folders,
// audio files, Google Docs, spreadsheets, etc. — but the setlist `+ Song`
// picker is for sheet-music charts. Filter to chart-shaped MIME types.
// Production breakdown 2026-05-08: 362 PDFs + 2 MusicXML = 364 charts; the
// other 91 active rows are 19 folders / 57 audio / 8 docs / 3 spreadsheets /
// 4 unknowns. Daniel's expected chart count was 94 (CRC) + 272 (Shireinu) ≈
// 366, which matches.
const CHART_MIME_TYPES = new Set<string>([
    'application/pdf',
    'application/xml',
    'application/vnd.recordare.musicxml',
    'application/vnd.recordare.musicxml+xml',
])

function isChartMime(mt: unknown): boolean {
    if (typeof mt !== 'string') return false
    return CHART_MIME_TYPES.has(mt)
}

interface SongDocLike {
    id?: string
    title?: string
    normalizedTitle?: string
    fileId?: string
    defaults?: unknown
    recent?: unknown
    createdAt?: number
    [k: string]: unknown
}

interface SetlistTrackLike {
    songId?: string
    fileId?: string
    [k: string]: unknown
}

interface SetlistDocLike {
    id?: string
    tracks?: SetlistTrackLike[]
    [k: string]: unknown
}

interface TopLevelTrackDocLike extends SetlistTrackLike {
    id?: string
}

interface BootstrapSnapshot {
    existedBefore: boolean
    prevTitle?: string
    prevNormalizedTitle?: string
    prevFileId?: string
    snapshottedAt: number
}

export interface BootstrapOpts {
    mode: 'apply' | 'dry-run' | 'rollback'
    force?: boolean
    backstitch?: boolean // default true; --no-backstitch disables
    log?: (msg: string) => void
    now?: () => number
}

export interface BootstrapResult {
    mode: 'apply' | 'dry-run' | 'rollback'
    songsWritten: number
    songsSkippedArchived: number
    songsAlreadyMatching: number
    backstitchedTracks: number
    skippedAlreadyApplied?: boolean
    rolledBack?: { deleted: number; preservedDueToMemory: number; restored: number }
}

const MARKER_PATH = 'system/v54SongsBootstrap'
const SNAPSHOT_COLLECTION = 'migrations/v54-bootstrap/snapshot'
const LIBRARY_INDEX = 'library_index'
const SONGS = 'songs'
const SETLISTS = 'setlists'
const TRACKS = 'tracks'

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
}

function songHasMemory(data: SongDocLike | null | undefined): boolean {
    if (!data) return false
    const hasDefaults =
        data.defaults !== undefined && data.defaults !== null &&
        typeof data.defaults === 'object' &&
        Object.keys(data.defaults as Record<string, unknown>).length > 0
    const hasRecent =
        Array.isArray(data.recent) && (data.recent as unknown[]).length > 0
    return hasDefaults || hasRecent
}

function buildSongPayload(
    libId: string,
    libData: LibraryIndexDocLike,
    existing: SongDocLike | null,
    now: number,
): SongDocLike {
    const title = String(libData.name ?? '').trim()
    const out: SongDocLike = {
        ...(existing ?? {}),
        id: libId,
        title,
        normalizedTitle: normalizeTitle(title),
        fileId: libId,
    }
    if (existing?.createdAt === undefined) {
        out.createdAt = now
    }
    return out
}

function payloadEqualsExisting(
    payload: SongDocLike,
    existing: SongDocLike | null,
): boolean {
    if (!existing) return false
    return (
        existing.title === payload.title &&
        existing.normalizedTitle === payload.normalizedTitle &&
        existing.fileId === payload.fileId
    )
}

// -------------------------------------------------------------------------
// Core
// -------------------------------------------------------------------------

export async function runBootstrap(
    fs: MigrationFirestore,
    opts: BootstrapOpts,
): Promise<BootstrapResult> {
    const log = opts.log ?? ((m: string) => console.log(m))
    const now = opts.now ?? (() => Date.now())
    const backstitch = opts.backstitch !== false // default true

    if (opts.mode === 'rollback') {
        return rollback(fs, log)
    }

    // Idempotency
    const marker = await fs.getDoc(MARKER_PATH)
    if (marker.exists && !opts.force) {
        log(
            `[v54] Already applied at ${String(marker.data?.appliedAt ?? '?')} — skipping. Use --force to re-run.`,
        )
        return {
            mode: opts.mode,
            songsWritten: 0,
            songsSkippedArchived: 0,
            songsAlreadyMatching: 0,
            backstitchedTracks: 0,
            skippedAlreadyApplied: true,
        }
    }

    // Read library_index — filter to active, named, chart-shaped rows.
    // Folders, audio files, Google Docs, spreadsheets are NOT songs.
    const libRows = (await fs.listCollection(LIBRARY_INDEX)) as Array<
        MigrationDoc & { data: LibraryIndexDocLike }
    >
    const candidates: Array<MigrationDoc & { data: LibraryIndexDocLike }> = []
    let songsSkippedArchived = 0
    for (const row of libRows) {
        const status = row.data?.status
        if (status === 'archived') {
            songsSkippedArchived += 1
            continue
        }
        const name = String(row.data?.name ?? '').trim()
        if (!name) {
            songsSkippedArchived += 1
            continue
        }
        if (!isChartMime(row.data?.mimeType)) {
            songsSkippedArchived += 1
            continue
        }
        candidates.push(row)
    }

    if (opts.mode === 'dry-run') {
        log(
            `[v54] DRY-RUN: ${candidates.length} song docs would be written (${songsSkippedArchived} skipped: archived or unnamed).`,
        )
        const sample = candidates.slice(0, 3)
        for (const c of sample) {
            const title = String(c.data.name ?? '').trim()
            log(
                `[DRY] songs/${c.id} ← { title: "${title}", normalizedTitle: "${normalizeTitle(title)}", fileId: "${c.id}" }`,
            )
        }
        if (candidates.length > 3) {
            log(`[DRY] ... + ${candidates.length - 3} more`)
        }

        if (backstitch) {
            // Compute candidate count without writing
            const candidateIds = new Set(candidates.map((c) => c.id))
            // For dry-run we also include any pre-existing songs/* ids so the
            // count reflects what `--apply` would actually link.
            const existingSongs = (await fs.listCollection(SONGS)) as Array<
                MigrationDoc & { data: SongDocLike }
            >
            for (const s of existingSongs) candidateIds.add(s.id)

            const { wouldUpdate } = await countBackstitchCandidates(
                fs,
                candidateIds,
            )
            log(
                `[v54] DRY-RUN: ${wouldUpdate} setlist tracks would gain songId via back-stitch.`,
            )
            return {
                mode: 'dry-run',
                songsWritten: candidates.length,
                songsSkippedArchived,
                songsAlreadyMatching: 0,
                backstitchedTracks: wouldUpdate,
            }
        }

        return {
            mode: 'dry-run',
            songsWritten: candidates.length,
            songsSkippedArchived,
            songsAlreadyMatching: 0,
            backstitchedTracks: 0,
        }
    }

    // APPLY mode
    let songsWritten = 0
    let songsAlreadyMatching = 0
    for (const cand of candidates) {
        const songPath = `${SONGS}/${cand.id}`
        const existingSnap = await fs.getDoc(songPath)
        const existing = existingSnap.exists
            ? (existingSnap.data as SongDocLike)
            : null

        // Snapshot prior state exactly once (don't clobber on --force re-runs
        // because a sticky-memory write may have happened between runs and we
        // want to preserve the ORIGINAL pre-bootstrap snapshot).
        const snapPath = `${SNAPSHOT_COLLECTION}/${cand.id}`
        const priorSnap = await fs.getDoc(snapPath)
        if (!priorSnap.exists) {
            const snapshot: BootstrapSnapshot = {
                existedBefore: existing !== null,
                snapshottedAt: now(),
                ...(existing?.title !== undefined
                    ? { prevTitle: existing.title }
                    : {}),
                ...(existing?.normalizedTitle !== undefined
                    ? { prevNormalizedTitle: existing.normalizedTitle }
                    : {}),
                ...(existing?.fileId !== undefined
                    ? { prevFileId: existing.fileId }
                    : {}),
            }
            await fs.setDoc(snapPath, snapshot as unknown as Record<string, unknown>)
        }

        const payload = buildSongPayload(cand.id, cand.data, existing, now())
        if (payloadEqualsExisting(payload, existing)) {
            songsAlreadyMatching += 1
            continue
        }
        await fs.setDoc(songPath, payload as unknown as Record<string, unknown>)
        songsWritten += 1
    }

    // Back-stitch
    let backstitchedTracks = 0
    if (backstitch) {
        // Build the set of songIds we KNOW to be valid after this run —
        // every candidate id (we just wrote them) plus any pre-existing
        // songs/* docs (untouched but still valid binding targets).
        const validIds = new Set(candidates.map((c) => c.id))
        const existingSongs = (await fs.listCollection(SONGS)) as Array<
            MigrationDoc & { data: SongDocLike }
        >
        for (const s of existingSongs) validIds.add(s.id)

        backstitchedTracks = await applyBackstitch(fs, validIds)
    }

    // Marker
    await fs.setDoc(MARKER_PATH, {
        appliedAt: now(),
        songsWritten,
        songsAlreadyMatching,
        songsSkippedArchived,
        backstitchedTracks,
        includedBackstitch: backstitch,
    })

    log(
        `[v54] APPLY complete: ${songsWritten} songs written, ${songsAlreadyMatching} already matching, ${songsSkippedArchived} skipped (archived/unnamed), ${backstitchedTracks} tracks back-stitched.`,
    )
    return {
        mode: 'apply',
        songsWritten,
        songsSkippedArchived,
        songsAlreadyMatching,
        backstitchedTracks,
    }
}

async function countBackstitchCandidates(
    fs: MigrationFirestore,
    validIds: Set<string>,
): Promise<{ wouldUpdate: number }> {
    let wouldUpdate = 0

    // Embedded tracks in setlists/*
    const setlists = (await fs.listCollection(SETLISTS)) as Array<
        MigrationDoc & { data: SetlistDocLike }
    >
    for (const s of setlists) {
        const tracks = Array.isArray(s.data.tracks) ? s.data.tracks : []
        for (const t of tracks) {
            if (typeof t.songId === 'string' && t.songId.length > 0) continue
            if (typeof t.fileId !== 'string' || t.fileId.length === 0) continue
            if (!validIds.has(t.fileId)) continue
            wouldUpdate += 1
        }
    }

    // Top-level tracks/*
    const topTracks = (await fs.listCollection(TRACKS)) as Array<
        MigrationDoc & { data: TopLevelTrackDocLike }
    >
    for (const t of topTracks) {
        const d = t.data
        if (typeof d.songId === 'string' && d.songId.length > 0) continue
        if (typeof d.fileId !== 'string' || d.fileId.length === 0) continue
        if (!validIds.has(d.fileId)) continue
        wouldUpdate += 1
    }

    return { wouldUpdate }
}

async function applyBackstitch(
    fs: MigrationFirestore,
    validIds: Set<string>,
): Promise<number> {
    let updated = 0

    // Embedded tracks: accumulate per-setlist patches and write once.
    const setlists = (await fs.listCollection(SETLISTS)) as Array<
        MigrationDoc & { data: SetlistDocLike }
    >
    for (const s of setlists) {
        const tracks = Array.isArray(s.data.tracks) ? s.data.tracks : []
        let mutated = false
        const patched = tracks.map((t) => {
            const hasSongId = typeof t.songId === 'string' && t.songId.length > 0
            const hasFileId = typeof t.fileId === 'string' && t.fileId.length > 0
            if (hasSongId || !hasFileId) return t
            if (!validIds.has(t.fileId as string)) return t
            mutated = true
            updated += 1
            return { ...t, songId: t.fileId }
        })
        if (mutated) {
            await fs.updateDoc(`${SETLISTS}/${s.id}`, { tracks: patched })
        }
    }

    // Top-level tracks
    const topTracks = (await fs.listCollection(TRACKS)) as Array<
        MigrationDoc & { data: TopLevelTrackDocLike }
    >
    for (const t of topTracks) {
        const d = t.data
        const hasSongId = typeof d.songId === 'string' && d.songId.length > 0
        const hasFileId = typeof d.fileId === 'string' && d.fileId.length > 0
        if (hasSongId || !hasFileId) continue
        if (!validIds.has(d.fileId as string)) continue
        await fs.updateDoc(`${TRACKS}/${t.id}`, { songId: d.fileId })
        updated += 1
    }

    return updated
}

async function rollback(
    fs: MigrationFirestore,
    log: (m: string) => void,
): Promise<BootstrapResult> {
    const snapshots = (await fs.listCollection(SNAPSHOT_COLLECTION)) as Array<
        MigrationDoc & { data: BootstrapSnapshot & Record<string, unknown> }
    >

    let deleted = 0
    let preservedDueToMemory = 0
    let restored = 0

    for (const snap of snapshots) {
        const songId = snap.id
        const songPath = `${SONGS}/${songId}`
        const cur = await fs.getDoc(songPath)
        if (!cur.exists) {
            // Nothing to undo; clean snapshot.
            await fs.deleteDoc(`${SNAPSHOT_COLLECTION}/${songId}`).catch(() => {})
            continue
        }
        const curData = cur.data as SongDocLike

        if (snap.data.existedBefore) {
            // Restore prior bootstrap-managed fields. Use a sentinel to delete
            // fields that weren't present before (the CLI adapter maps to
            // FieldValue.delete; the test fake handles it directly).
            const patch: Record<string, unknown> = {}
            patch.title =
                snap.data.prevTitle === undefined
                    ? FIELD_DELETE_SENTINEL
                    : snap.data.prevTitle
            patch.normalizedTitle =
                snap.data.prevNormalizedTitle === undefined
                    ? FIELD_DELETE_SENTINEL
                    : snap.data.prevNormalizedTitle
            patch.fileId =
                snap.data.prevFileId === undefined
                    ? FIELD_DELETE_SENTINEL
                    : snap.data.prevFileId
            await fs.updateDoc(songPath, patch)
            restored += 1
        } else {
            // Bootstrap created this doc. Preserve if sticky memory has
            // attached; otherwise delete.
            if (songHasMemory(curData)) {
                preservedDueToMemory += 1
            } else {
                await fs.deleteDoc(songPath)
                deleted += 1
            }
        }
        await fs.deleteDoc(`${SNAPSHOT_COLLECTION}/${songId}`).catch(() => {})
    }

    await fs.deleteDoc(MARKER_PATH).catch(() => {})

    log(
        `[v54] ROLLBACK complete: ${deleted} bootstrap-created docs deleted, ${preservedDueToMemory} preserved (had sticky memory), ${restored} pre-existing docs restored.`,
    )
    return {
        mode: 'rollback',
        songsWritten: 0,
        songsSkippedArchived: 0,
        songsAlreadyMatching: 0,
        backstitchedTracks: 0,
        rolledBack: { deleted, preservedDueToMemory, restored },
    }
}

// -------------------------------------------------------------------------
// CLI entry point
// -------------------------------------------------------------------------

function parseArgs(argv: string[]): {
    mode: 'apply' | 'dry-run' | 'rollback' | 'help'
    force: boolean
    backstitch: boolean
} {
    if (argv.includes('--help') || argv.includes('-h')) {
        return { mode: 'help', force: false, backstitch: true }
    }
    const force = argv.includes('--force')
    const backstitch = !argv.includes('--no-backstitch')
    if (argv.includes('--rollback')) {
        return { mode: 'rollback', force, backstitch }
    }
    if (argv.includes('--dry-run')) {
        return { mode: 'dry-run', force, backstitch }
    }
    return { mode: 'apply', force, backstitch }
}

function printHelp(): void {
    console.log(`bootstrap-songs — populate songs/* from library_index + back-stitch tracks (v5.4 phase v54-01)

Usage:
  npx tsx scripts/bootstrap-songs.ts                 Apply (back-stitch ON by default)
  npx tsx scripts/bootstrap-songs.ts --dry-run       Enumerate planned writes; no changes
  npx tsx scripts/bootstrap-songs.ts --no-backstitch Skip the songId back-stitch loop
  npx tsx scripts/bootstrap-songs.ts --force         Re-run even if marker exists
  npx tsx scripts/bootstrap-songs.ts --rollback      Restore pre-bootstrap state (sticky-memory safe)
  npx tsx scripts/bootstrap-songs.ts --help          Show this help

Reference: .paul/phases/v54-01-picker-bootstrap-and-thead-hotfix/v54-01-01-PLAN.md
`)
}

async function main(): Promise<void> {
    const { mode, force, backstitch } = parseArgs(process.argv.slice(2))
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
                '[v54] Missing Firebase Admin credentials in .env.local — aborting.',
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

    const result = await runBootstrap(adapter, { mode, force, backstitch })
    if (mode === 'apply' && !result.skippedAlreadyApplied) {
        console.log(
            `[v54] Done. songs written: ${result.songsWritten} | already matching: ${result.songsAlreadyMatching} | skipped: ${result.songsSkippedArchived} | back-stitched: ${result.backstitchedTracks}`,
        )
    } else if (mode === 'rollback' && result.rolledBack) {
        console.log(
            `[v54] Rollback summary — deleted: ${result.rolledBack.deleted} | preserved: ${result.rolledBack.preservedDueToMemory} | restored: ${result.rolledBack.restored}`,
        )
    }
}

const isMainModule =
    typeof require !== 'undefined' && require.main === module
if (isMainModule) {
    main().catch((err) => {
        console.error('[v54] FATAL:', err)
        process.exit(1)
    })
}
