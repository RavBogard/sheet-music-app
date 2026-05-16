/**
 * F-03 one-time migration — re-pack every setlist's tracks so `order`
 * values are contiguous [0..n-1] with no gaps.
 *
 * Why: 2026-05-16 bugstomp F-03 caught the May 2 Shabbat setlist holding
 * 30 tracks with `order` values spanning 0..44 (15 gaps). `remove_track`
 * and prior reorder code paths re-packed the array but not the underlying
 * order values, so gaps accumulate over the life of a long-lived setlist.
 * The UI sorts by order and renders contiguously, so the drift is
 * operator-invisible — but any feature that uses `order` arithmetically
 * (insert at N, split at midpoint, etc.) misbehaves.
 *
 * Idempotent: setlists whose tracks already have contiguous orders are
 * skipped. Running this twice on a clean catalog produces zero writes.
 *
 * Run with:
 *   npx tsx scripts/repack-track-order.ts [--dry-run|--apply|--help]
 *
 * Default mode is --dry-run.
 *
 * The invariant-on-write half (re-pack after remove_track / position
 * moves / reorder_setlist) is a W-05 candidate; this script closes the
 * back-pressure of existing drift before that invariant ships.
 */

import * as dotenv from "dotenv"
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

dotenv.config({ path: ".env.local" })

const BATCH_SIZE = 400 // Firestore commit limit is 500; pad for safety

type Mode = "dry-run" | "apply"

function parseArgs(argv: string[]): { mode: Mode; help: boolean } {
    const help = argv.includes("--help") || argv.includes("-h")
    const apply = argv.includes("--apply")
    return { mode: apply ? "apply" : "dry-run", help }
}

function usage(): void {
    console.log(`
F-03 track-order re-pack migration

Usage:
  npx tsx scripts/repack-track-order.ts [options]

Options:
  --dry-run   (default) Print planned writes, don't commit.
  --apply     Commit the writes to Firestore.
  --help      Show this message.

The script:
  1. Reads every setlist doc.
  2. For each, reads its tracks (tracks where setlistId == <id>) sorted by order.
  3. Checks if the order values are contiguous [0..n-1].
  4. If not, schedules an update to renumber each track to its array index.
  5. Skips setlists whose tracks are already contiguous (idempotent).
  6. Batches updates at ${BATCH_SIZE} per commit; multiple commits per setlist if needed.
`)
}

function initFirebase(): void {
    if (getApps().length > 0) return
    const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        "crcmusiccharts"
    initializeApp({ projectId, credential: applicationDefault() })
}

interface SetlistPlan {
    setlistId: string
    setlistName: string
    trackCount: number
    /** Original order values, in array order (sorted ascending by order). */
    originalOrders: number[]
    /** Gaps detected in the original order sequence. */
    gaps: number[]
    /** Per-track updates: trackId → new order. Empty when already contiguous. */
    updates: Array<{ trackId: string; oldOrder: number; newOrder: number }>
}

async function planSetlist(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
    setlistName: string,
): Promise<SetlistPlan> {
    const snap = await db
        .collection("tracks")
        .where("setlistId", "==", setlistId)
        .get()

    // Sort by order ascending. Tracks with undefined/non-numeric order sort
    // last (they'll get the highest contiguous indices). We don't drop them
    // — every row needs a deterministic position post-migration.
    const tracks = snap.docs
        .map((d) => ({
            id: d.id,
            order:
                typeof d.data().order === "number"
                    ? (d.data().order as number)
                    : Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.order - b.order)

    const originalOrders = tracks.map((t) => t.order)
    const gaps: number[] = []
    const maxOrder =
        originalOrders.length > 0
            ? Math.max(...originalOrders.filter((o) => o < Number.MAX_SAFE_INTEGER))
            : -1
    if (maxOrder >= 0) {
        const orderSet = new Set(originalOrders)
        for (let i = 0; i <= maxOrder; i++) {
            if (!orderSet.has(i)) gaps.push(i)
        }
    }

    const updates: SetlistPlan["updates"] = []
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].order !== i) {
            updates.push({
                trackId: tracks[i].id,
                oldOrder: tracks[i].order,
                newOrder: i,
            })
        }
    }

    return {
        setlistId,
        setlistName,
        trackCount: tracks.length,
        originalOrders,
        gaps,
        updates,
    }
}

async function commitUpdates(
    db: FirebaseFirestore.Firestore,
    updates: SetlistPlan["updates"],
): Promise<void> {
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const chunk = updates.slice(i, i + BATCH_SIZE)
        const batch = db.batch()
        for (const u of chunk) {
            batch.update(db.collection("tracks").doc(u.trackId), {
                order: u.newOrder,
            })
        }
        await batch.commit()
    }
}

async function main(): Promise<void> {
    const { mode, help } = parseArgs(process.argv.slice(2))
    if (help) {
        usage()
        return
    }

    initFirebase()
    const db = getFirestore()

    console.log(`F-03 track-order re-pack — mode: ${mode}`)
    console.log("=".repeat(60))

    const setlistsSnap = await db.collection("setlists").get()
    console.log(`Scanning ${setlistsSnap.size} setlists...\n`)

    let cleanCount = 0
    let dirtyCount = 0
    let totalUpdates = 0
    let totalWritesCommitted = 0

    for (const doc of setlistsSnap.docs) {
        const data = doc.data() as Record<string, unknown>
        const name = typeof data.name === "string" ? data.name : "(unnamed)"
        const plan = await planSetlist(db, doc.id, name)

        if (plan.trackCount === 0) {
            // Empty setlist — nothing to do, not even worth printing.
            continue
        }

        if (plan.updates.length === 0) {
            cleanCount++
            continue
        }

        dirtyCount++
        totalUpdates += plan.updates.length
        const gapPreview =
            plan.gaps.length <= 8
                ? `[${plan.gaps.join(", ")}]`
                : `[${plan.gaps.slice(0, 8).join(", ")}, ...+${plan.gaps.length - 8}]`
        console.log(
            `  ${doc.id.slice(0, 8)}… "${name}" — ${plan.trackCount} tracks, ${plan.updates.length} updates, gaps at ${gapPreview}`,
        )

        if (mode === "apply") {
            await commitUpdates(db, plan.updates)
            totalWritesCommitted += plan.updates.length
        }
    }

    console.log("\n" + "=".repeat(60))
    console.log(`Setlists already contiguous: ${cleanCount}`)
    console.log(`Setlists needing re-pack:    ${dirtyCount}`)
    console.log(`Total per-track updates:     ${totalUpdates}`)
    if (mode === "apply") {
        console.log(`Writes committed:            ${totalWritesCommitted}`)
        console.log("\n✓ Migration applied.")
    } else {
        console.log("\nDRY RUN — no writes committed. Pass --apply to commit.")
    }
}

main().catch((err) => {
    console.error("repack-track-order failed:", err)
    process.exit(1)
})
