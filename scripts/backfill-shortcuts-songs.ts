// v60-11-01 backfill — seed songs/* with the historical library_index entries
// that v54-01-01's bootstrap MIME filter excluded (Drive shortcuts + folders +
// audio + docs + spreadsheets — ~134 docs total: 498 library_index vs 364
// songs/* on 2026-05-13). Closes UAT Issue 1 (Daniel: "Lechu Goldman" and
// similar songs invisible in chart-binder picker).
//
// v60-11-01 Task 2 makes the ongoing syncLibraryIndex tick mirror everything
// to songs/* going forward (no MIME filter); THIS script seeds the historical
// gap so the existing 134 docs become pickable without waiting for Drive to
// modify them.
//
// Run with: npx tsx scripts/backfill-shortcuts-songs.ts [--dry-run|--apply|--force|--help]
//
// Append-only — NEVER touches existing songs/* docs (sticky memory: defaults +
// recent fields preserved). Dedicated marker (`system/v60-11-backfill`) blocks
// accidental re-apply; --force overrides.
//
// Despite the file name, scope is "all library_index entries missing from
// songs/*" — not literally shortcut-only. The name preserves Daniel's UAT
// framing ("Lechu Goldman" is a shortcut); actual contents are mixed.

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface LibraryIndexDocLike {
    name?: string
    [k: string]: unknown
}

interface SongsMirrorPayload {
    id: string
    title: string
    normalizedTitle: string
    fileId: string
    createdAt: number
}

interface BackfillSummary {
    libraryIndexTotal: number
    songsTotal: number
    missingFound: number
    skippedEmptyName: number
    written: number
    sampledIds: string[]
    appliedAt?: number
    markerSkipped?: boolean
}

const MARKER_PATH = 'system/v60-11-backfill'

// -------------------------------------------------------------------------
// Payload builder — matches sync-engine.ts buildSongsMirrorPayload + bootstrap-songs.ts:142
// VERBATIM: no .pdf stripping, no status field. The 364 existing bootstrap docs
// carry titles with extension; new docs must match or picker shows mixed shapes.
// -------------------------------------------------------------------------

function buildPayload(fileId: string, rawName: string, now: number): SongsMirrorPayload {
    const title = rawName.trim()
    return {
        id: fileId,
        title,
        normalizedTitle: title.toLowerCase(),
        fileId,
        createdAt: now,
    }
}

// -------------------------------------------------------------------------
// Core
// -------------------------------------------------------------------------

export interface BackfillOpts {
    mode: 'dry-run' | 'apply'
    force?: boolean
    log?: (msg: string) => void
    now?: () => number
}

export interface FirestoreAdapter {
    getDoc(path: string): Promise<{ exists: boolean; data: Record<string, unknown> | null }>
    listCollection(path: string): Promise<Array<{ id: string; data: Record<string, unknown> }>>
    setDoc(path: string, data: Record<string, unknown>): Promise<void>
}

export async function runBackfill(
    fs: FirestoreAdapter,
    opts: BackfillOpts,
): Promise<BackfillSummary> {
    const log = opts.log ?? ((m: string) => console.log(m))
    const now = opts.now ?? (() => Date.now())

    // Idempotency check
    if (opts.mode === 'apply' && !opts.force) {
        const marker = await fs.getDoc(MARKER_PATH)
        if (marker.exists) {
            const appliedAt = marker.data?.appliedAt
            log(`[v60-11] Already applied at ${String(appliedAt ?? '?')} — skipping. Use --force to re-run.`)
            return {
                libraryIndexTotal: 0,
                songsTotal: 0,
                missingFound: 0,
                skippedEmptyName: 0,
                written: 0,
                sampledIds: [],
                markerSkipped: true,
            }
        }
    }

    // Read both collections
    const libDocs = await fs.listCollection('library_index')
    const songsDocs = await fs.listCollection('songs')
    const existingSongsIds = new Set(songsDocs.map((s) => s.id))

    // Compute missing
    let skippedEmptyName = 0
    const missing: Array<{ id: string; data: LibraryIndexDocLike }> = []
    for (const lib of libDocs) {
        if (existingSongsIds.has(lib.id)) continue
        const libData = lib.data as LibraryIndexDocLike
        const rawName = typeof libData.name === 'string' ? libData.name.trim() : ''
        if (rawName.length === 0) {
            skippedEmptyName += 1
            continue
        }
        missing.push({ id: lib.id, data: libData })
    }

    const sampledIds = missing.slice(0, 3).map((m) => m.id)

    log(`[v60-11] Read ${libDocs.length} library_index docs, ${songsDocs.length} existing songs.`)
    log(`[v60-11] Found ${missing.length} missing songs/* docs (${skippedEmptyName} skipped: empty/missing name).`)
    if (sampledIds.length > 0) {
        log(`[v60-11] Sample IDs to write: ${sampledIds.join(', ')}`)
    }

    if (opts.mode === 'dry-run') {
        return {
            libraryIndexTotal: libDocs.length,
            songsTotal: songsDocs.length,
            missingFound: missing.length,
            skippedEmptyName,
            written: 0,
            sampledIds,
        }
    }

    // APPLY mode
    let written = 0
    for (const m of missing) {
        const rawName = String((m.data as LibraryIndexDocLike).name ?? '').trim()
        const payload = buildPayload(m.id, rawName, now())
        await fs.setDoc(`songs/${m.id}`, payload as unknown as Record<string, unknown>)
        written += 1
    }

    const appliedAt = now()
    await fs.setDoc(MARKER_PATH, {
        appliedAt,
        missingFound: missing.length,
        written,
        sampledIds,
        skippedEmptyName,
    })

    log(`[v60-11] APPLY complete: ${written} missing songs/* docs written. Marker: ${MARKER_PATH}`)

    return {
        libraryIndexTotal: libDocs.length,
        songsTotal: songsDocs.length,
        missingFound: missing.length,
        skippedEmptyName,
        written,
        sampledIds,
        appliedAt,
    }
}

// -------------------------------------------------------------------------
// CLI entry point
// -------------------------------------------------------------------------

function parseArgs(argv: string[]): { mode: 'dry-run' | 'apply' | 'help'; force: boolean } {
    if (argv.includes('--help') || argv.includes('-h')) {
        return { mode: 'help', force: false }
    }
    const force = argv.includes('--force')
    if (argv.includes('--dry-run')) {
        return { mode: 'dry-run', force }
    }
    return { mode: 'apply', force }
}

function printHelp(): void {
    console.log(`backfill-shortcuts-songs — seed songs/* with the v54-01-01 MIME-filter exclusions (v60-11-01)

Usage:
  npx tsx scripts/backfill-shortcuts-songs.ts --dry-run    Enumerate missing songs/* docs; no writes
  npx tsx scripts/backfill-shortcuts-songs.ts              APPLY: write missing docs (marker prevents re-run)
  npx tsx scripts/backfill-shortcuts-songs.ts --force      Re-run even if marker exists
  npx tsx scripts/backfill-shortcuts-songs.ts --help       Show this help

Notes:
  - Append-only: existing songs/* docs are NEVER modified (sticky memory preserved).
  - Marker: system/v60-11-backfill (separate from system/v54SongsBootstrap).
  - Payload matches sync-engine buildSongsMirrorPayload — title verbatim, no status.

Reference: .paul/phases/v60-11-shortcut-aware-songs-mirror/v60-11-01-PLAN.md
`)
}

async function main(): Promise<void> {
    const { mode, force } = parseArgs(process.argv.slice(2))
    if (mode === 'help') {
        printHelp()
        return
    }

    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')

    if (getApps().length === 0) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        if (!projectId || !clientEmail || !privateKey) {
            console.error('[v60-11] Missing Firebase Admin credentials in .env.local — aborting.')
            process.exit(1)
        }
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    }
    const db = getFirestore()

    const adapter: FirestoreAdapter = {
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
    }

    const result = await runBackfill(adapter, { mode, force })
    if (mode === 'apply' && !result.markerSkipped) {
        console.log(
            `[v60-11] Done. lib total: ${result.libraryIndexTotal} | songs before: ${result.songsTotal} | missing: ${result.missingFound} | written: ${result.written} | skipped empty: ${result.skippedEmptyName}`,
        )
    }
}

const isMainModule = typeof require !== 'undefined' && require.main === module
if (isMainModule) {
    main().catch((err) => {
        console.error('[v60-11] FATAL:', err)
        process.exit(1)
    })
}
