// One-shot READ + selective-WRITE script: removes the orphan `liveState` field
// from setlists. v50-02 amputation deleted the code that consumed liveState
// but left field data in place. This scrubs it.
//
// Run with:
//   npx tsx scripts/scrub-livestate.ts --dry-run     (default-safe; reports affected)
//   npx tsx scripts/scrub-livestate.ts --apply       (executes; rollback snapshots written)
//   npx tsx scripts/scrub-livestate.ts --rollback    (restores from snapshots)
//   npx tsx scripts/scrub-livestate.ts --force       (re-runs even if marker present)
//   npx tsx scripts/scrub-livestate.ts --help

import * as dotenv from 'dotenv'

import {
    FIELD_DELETE_SENTINEL,
    type MigrationDoc,
    type MigrationFirestore,
} from './migrate-v50'

dotenv.config({ path: '.env.local' })

const MARKER_PATH = 'system/livestateScrub' // 2-segment doc path
const SNAPSHOT_COLLECTION = 'migrations/livestate-scrub/snapshot'
//                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// 3-segment collection. Combined with `${SNAPSHOT_COLLECTION}/${id}` = 4-segment doc.

export interface ScrubOpts {
    mode: 'apply' | 'dry-run' | 'rollback'
    force?: boolean
    log?: (msg: string) => void
    now?: () => number
}

export interface ScrubResult {
    mode: 'apply' | 'dry-run' | 'rollback'
    affectedCount: number
    sampleIds: string[]
    skippedAlreadyApplied?: boolean
}

function setlistHasLiveState(data: Record<string, unknown>): boolean {
    return data.liveState !== undefined && data.liveState !== null
}

export async function runScrub(
    fs: MigrationFirestore,
    opts: ScrubOpts,
): Promise<ScrubResult> {
    const log = opts.log ?? ((m: string) => console.log(m))
    const now = opts.now ?? (() => Date.now())

    if (opts.mode === 'rollback') {
        return rollback(fs, log)
    }

    // Idempotency check
    const marker = await fs.getDoc(MARKER_PATH)
    if (marker.exists && !opts.force) {
        log(
            `[scrub] Already applied at ${String(marker.data?.appliedAt ?? '?')} — skipping. Use --force to re-run.`,
        )
        return {
            mode: opts.mode,
            affectedCount: 0,
            sampleIds: [],
            skippedAlreadyApplied: true,
        }
    }

    // Find affected setlists
    const setlists = await fs.listCollection('setlists')
    const affected = setlists.filter((s) => setlistHasLiveState(s.data))
    const sampleIds = affected.slice(0, 5).map((s) => s.id)

    if (opts.mode === 'dry-run') {
        log(`[scrub] DRY-RUN: ${affected.length} setlists carry liveState.`)
        if (sampleIds.length > 0) {
            log(`[scrub] Sample IDs: ${sampleIds.join(', ')}`)
        }
        if (affected.length > sampleIds.length) {
            log(`[scrub] ... + ${affected.length - sampleIds.length} more`)
        }
        return {
            mode: 'dry-run',
            affectedCount: affected.length,
            sampleIds,
        }
    }

    // APPLY: snapshot then delete
    let scrubbed = 0
    for (const s of affected) {
        const snapshot = {
            liveState: s.data.liveState,
            snapshottedAt: now(),
        }
        await fs.setDoc(`${SNAPSHOT_COLLECTION}/${s.id}`, snapshot)
        await fs.updateDoc(`setlists/${s.id}`, {
            liveState: FIELD_DELETE_SENTINEL,
        })
        scrubbed += 1
    }

    await fs.setDoc(MARKER_PATH, {
        appliedAt: now(),
        affectedCount: scrubbed,
    })

    log(`[scrub] APPLY complete: ${scrubbed} setlists scrubbed.`)
    return { mode: 'apply', affectedCount: scrubbed, sampleIds }
}

async function rollback(
    fs: MigrationFirestore,
    log: (m: string) => void,
): Promise<ScrubResult> {
    const snapshots = await fs.listCollection(SNAPSHOT_COLLECTION)
    let restored = 0
    const ids: string[] = []
    for (const snap of snapshots) {
        const setlistId = snap.id
        const liveState = snap.data?.liveState
        // Restore the field. If the snapshot held an explicit null, write null
        // back; otherwise restore the captured value verbatim.
        await fs.updateDoc(`setlists/${setlistId}`, { liveState })
        restored += 1
        if (ids.length < 5) ids.push(setlistId)
    }

    await fs.deleteDoc(MARKER_PATH).catch(() => {})

    log(`[scrub] ROLLBACK complete: ${restored} setlists restored.`)
    return {
        mode: 'rollback',
        affectedCount: restored,
        sampleIds: ids,
    }
}

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
    if (argv.includes('--apply')) {
        return { mode: 'apply', force: argv.includes('--force') }
    }
    // Default: dry-run (safer than migrate-v50.ts which defaults to apply).
    return { mode: 'dry-run', force: argv.includes('--force') }
}

function printHelp(): void {
    console.log(`scrub-livestate — strip orphan liveState field from setlists (v50-07-02)

Usage:
  npx tsx scripts/scrub-livestate.ts                Dry-run (default; safe)
  npx tsx scripts/scrub-livestate.ts --dry-run      Same as default
  npx tsx scripts/scrub-livestate.ts --apply        Execute scrub + write rollback snapshots
  npx tsx scripts/scrub-livestate.ts --apply --force  Re-run even if marker present
  npx tsx scripts/scrub-livestate.ts --rollback     Restore liveState from snapshots
  npx tsx scripts/scrub-livestate.ts --help         Show this help

Reference: .paul/phases/v50-07-migration-cutover/v50-07-02-PLAN.md
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
                '[scrub] Missing Firebase Admin credentials in .env.local — aborting.',
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

    const result = await runScrub(adapter, { mode, force })
    if (mode === 'apply' && !result.skippedAlreadyApplied) {
        console.log(
            `[scrub] Done. ${result.affectedCount} setlists updated. Rollback snapshots in ${SNAPSHOT_COLLECTION}/*`,
        )
    }
}

const isMainModule =
    typeof require !== 'undefined' && require.main === module
if (isMainModule) {
    main().catch((err) => {
        console.error('[scrub] FATAL:', err)
        process.exit(1)
    })
}
