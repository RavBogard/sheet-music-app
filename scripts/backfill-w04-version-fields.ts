/**
 * B-007 version backfill (v6 bugstomp) — stamp `version: 1` +
 * `lastModifiedAt` on every pre-W-04 setlist + track doc that's missing
 * them.
 *
 * Why: W-04 Plan 01 stamps version + lastModifiedAt on every NEW write,
 * but pre-W-04 docs (setlists created before 2026-05-16) carry neither
 * field. `readVersion()` returns 0 for missing → an agent that calls
 * `get_setlist` on a pre-W-04 setlist sees `version: 0`, can pass that
 * to `update_track({lastSeenVersion: 0})`, and the gate works. But the
 * envelope shape is inconsistent (no `lastModifiedAt` to surface in the
 * setlist subobject), and 0-vs-undefined ambiguity makes downstream
 * tools harder to reason about.
 *
 * This script stamps `version: 1`, `lastModifiedAt: <now-ISO>` on every
 * setlist + track doc lacking those fields. Idempotent: skips docs that
 * already have version. Doesn't stamp `lastModifiedBy` because we don't
 * know who originally wrote them — leaving it undefined matches what
 * stampVersionWrite produces when actorUid isn't supplied.
 *
 * After this runs, the first agent that fetches a pre-W-04 setlist sees
 * `version: 1` (not 0), and the W04-track-stale envelope shape carries
 * `lastModifiedAt`. The first real write still bumps version to 2 as
 * expected.
 *
 * One semantic shift: any agent caching `version: 0` from a get_setlist
 * BEFORE this script runs, then calling update_track with
 * `lastSeenVersion: 0` AFTER, will get a stale_version rejection (0 !== 1).
 * That's the correct behavior — the resource was mutated (by this
 * script) since the cached read.
 *
 * Run:
 *   npx tsx scripts/backfill-w04-version-fields.ts            # dry-run
 *   npx tsx scripts/backfill-w04-version-fields.ts --apply    # commit
 *   npx tsx scripts/backfill-w04-version-fields.ts --help
 *
 * Snapshot of every doc touched at
 * `outputs/backfill-w04-version-fields-<ISO>.json`.
 */
import * as dotenv from "dotenv"
import * as fs from "node:fs"
import * as path from "node:path"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

dotenv.config({ path: ".env.local" })

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
    console.log(
        `Usage: npx tsx scripts/backfill-w04-version-fields.ts [--apply|--dry-run|--help]\n` +
            `\n` +
            `Default mode is --dry-run.\n`,
    )
    process.exit(0)
}
const APPLY = args.includes("--apply")
const MODE = APPLY ? "APPLY" : "DRY-RUN"

if (getApps().length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    if (!projectId || !clientEmail || !privateKey) {
        console.error(
            "Missing Firebase admin creds. Set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local.",
        )
        process.exit(1)
    }
    initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
    })
}

const db = getFirestore()
const STAMP_ISO = new Date().toISOString()

console.log(`[backfill-w04] mode: ${MODE}, stamp: ${STAMP_ISO}`)

interface Touch {
    collection: "setlists" | "tracks"
    id: string
    name?: string | null
    parentSetlistId?: string | null
}

async function scan(): Promise<Touch[]> {
    const touches: Touch[] = []

    console.log("[backfill-w04] scanning setlists ...")
    const setlistSnap = await db.collection("setlists").get()
    for (const doc of setlistSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        if (typeof data.version !== "number") {
            touches.push({
                collection: "setlists",
                id: doc.id,
                name: (data.name as string) ?? null,
            })
        }
    }
    console.log(
        `[backfill-w04]   setlists: ${setlistSnap.size} total, ${touches.length} need backfill`,
    )

    console.log("[backfill-w04] scanning tracks ...")
    const trackSnap = await db.collection("tracks").get()
    const trackTouchesStart = touches.length
    for (const doc of trackSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        if (typeof data.version !== "number") {
            touches.push({
                collection: "tracks",
                id: doc.id,
                parentSetlistId: (data.setlistId as string) ?? null,
                name: (data.title as string) ?? null,
            })
        }
    }
    console.log(
        `[backfill-w04]   tracks: ${trackSnap.size} total, ${touches.length - trackTouchesStart} need backfill`,
    )

    return touches
}

async function main() {
    const touches = await scan()

    // Snapshot the plan.
    const outDir = path.resolve("outputs")
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const stamp = STAMP_ISO.replace(/[:.]/g, "-")
    const snapshotFile = path.join(
        outDir,
        `backfill-w04-version-fields-${stamp}.json`,
    )
    fs.writeFileSync(
        snapshotFile,
        JSON.stringify(
            {
                mode: MODE,
                generatedAt: STAMP_ISO,
                summary: {
                    setlists: touches.filter((t) => t.collection === "setlists").length,
                    tracks: touches.filter((t) => t.collection === "tracks").length,
                    total: touches.length,
                },
                touches,
            },
            null,
            2,
        ),
    )
    console.log(`[backfill-w04] snapshot: ${snapshotFile}`)
    console.log(`[backfill-w04] sample setlists (first 5):`)
    for (const t of touches.filter((t) => t.collection === "setlists").slice(0, 5)) {
        console.log(`  setlists/${t.id}  "${t.name}"`)
    }
    console.log(`[backfill-w04] sample tracks (first 5):`)
    for (const t of touches.filter((t) => t.collection === "tracks").slice(0, 5)) {
        console.log(
            `  tracks/${t.id}  "${t.name}"  (setlist: ${t.parentSetlistId})`,
        )
    }

    if (!APPLY) {
        console.log(
            `[backfill-w04] DRY-RUN complete. Pass --apply to commit ${touches.length} writes.`,
        )
        return
    }

    if (touches.length === 0) {
        console.log("[backfill-w04] nothing to backfill.")
        return
    }

    // Batch writes — Firestore limit is 500/batch.
    const BATCH = 400
    let committed = 0
    for (let i = 0; i < touches.length; i += BATCH) {
        const slice = touches.slice(i, i + BATCH)
        const batch = db.batch()
        for (const t of slice) {
            batch.update(db.collection(t.collection).doc(t.id), {
                version: 1,
                lastModifiedAt: STAMP_ISO,
            })
        }
        await batch.commit()
        committed += slice.length
        console.log(
            `[backfill-w04] committed ${committed}/${touches.length} ...`,
        )
    }
    console.log(`[backfill-w04] APPLY complete. ${committed} docs backfilled.`)
}

main().catch((err) => {
    console.error("[backfill-w04] FAILED:", err)
    process.exit(1)
})
