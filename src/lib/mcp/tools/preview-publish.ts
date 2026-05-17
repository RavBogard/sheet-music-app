import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { publishSetlist, type PublishSetlistResult } from "./setlist-publish"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * W-01 Task 3 — preview_publish wrapper.
 *
 * Thin reformatter over `publish_setlist({dryRun: true})` for the chat-native
 * confirm-before-send loop. The publish dryRun already does the expensive
 * work (chart-health pre-flight, recipient resolution, snapshot build); this
 * tool tightens the envelope into the four signals an agent needs to say
 * "ready to publish?" in a single chat turn:
 *
 *   - `chartHealth`     — pre-flight rendering status per row + summary.
 *   - `audience`        — count + role breakdown of who will be notified.
 *   - `snapshotDiff`    — what changed vs. the last `publishedSnapshot`
 *                         (added / removed / modified tracks). Empty on a
 *                         first publish.
 *   - `flaggedBonds`    — open `bond_flags` docs awaiting batch review
 *                         (Task 4 collection). The agent should walk them
 *                         via `review_flagged_bonds` before publishing.
 *   - `recommendation`  — derived gate:
 *                         "hard_block"   any chart status is "missing"
 *                         "review_first" flaggedBonds > 0
 *                         "publish"      otherwise (clean)
 *
 * Recommendation is advisory only — the operator still has to call
 * `publish_setlist` to actually send. `unreachable` charts intentionally do
 * NOT hard_block (transient network failures); only definitive "missing"
 * does. This mirrors publish_setlist's pre-flight refusal semantics:
 * publish refuses on either missing or unreachable, but for the preview
 * gate we want the agent to surface unreachable to the operator without
 * blocking it — the operator may know the chart is fine and just want to
 * proceed.
 */

// Cycle-2 REG-001b: errors return the canonical rich envelope.

export interface PreviewPublishArgs {
    setlistId: string
    /** Audience preset forwarded to publish_setlist. */
    audience?: "band" | "all"
}

export interface PreviewPublishResult {
    ok: true
    setlistId: string
    setlistName: string
    wasAlreadyPublished: boolean
    chartHealth: {
        bondedCount: number
        okCount: number
        missingCount: number
        unreachableCount: number
        /**
         * Cycle-3 b5 followup: parity with publish_setlist's chartHealth +
         * verify_setlist_charts' NEW-5 field. Rows where Drive has the bytes
         * but Storage doesn't yet — chart serves, but the row is mid-resolve.
         * Surfaced here so a preview can flag pending Drive→Storage syncs
         * without escalating the recommendation gate.
         */
        needsSyncCount: number
        /**
         * Per-row report for charts that aren't ok. Same shape + field name as
         * `publish_setlist({dryRun:true}).chartHealth.unhealthy` (F-006 unify).
         */
        unhealthy: Array<{
            trackId: string
            title: string
            fileId: string
            status: "missing" | "unreachable"
            reason: string
        }>
    }
    audience: {
        count: number
        breakdown: {
            admin: number
            band_leader: number
            musician: number
            member: number
        }
    }
    snapshotDiff: {
        addedTracks: Array<{ title: string; key: string; fileId: string }>
        removedTracks: Array<{ title: string; key: string; fileId: string }>
        modifiedTracks: Array<{
            fileId: string
            title: string
            key: string
            previousTitle?: string
            previousKey?: string
        }>
    }
    flaggedBonds: number
    recommendation: "publish" | "review_first" | "hard_block"
}

export async function previewPublish(
    callerUid: string,
    args: PreviewPublishArgs,
): Promise<PreviewPublishResult | RichErrorEnvelope> {
    if (!args.setlistId?.trim())
        return richError(
            "invalid_argument",
            "setlistId must be a non-empty string.",
            { field: "setlistId" },
        )

    initAdmin()
    const db = getFirestore()

    // Delegate the heavy lifting to publish_setlist's dryRun path. It owns
    // auth, rate limiting, chart-health pre-flight, snapshot generation,
    // and recipient resolution. Per F-05 (2026-05-16 bugstomp), dryRun is
    // observability — it never refuses on the chart-health gate, so this
    // tool always gets a populated envelope back.
    const dry = await publishSetlist(callerUid, {
        setlistId: args.setlistId,
        audience: args.audience,
        dryRun: true,
    })
    if (!("ok" in dry) || dry.ok !== true) {
        // dry is already a RichErrorEnvelope (or StaleVersionEnvelope which
        // we don't trigger here since we don't pass lastSeenVersion).
        return dry as RichErrorEnvelope
    }
    const published = dry as PublishSetlistResult

    // ── Snapshot diff vs. the last `publishedSnapshot` on the setlist doc.
    // The doc lives in the same `setlists/{id}` row publish writes; the
    // dryRun's `snapshot` field is the would-publish state.
    const setlistSnap = await db
        .collection("setlists")
        .doc(args.setlistId)
        .get()
    const setlist = setlistSnap.exists
        ? (setlistSnap.data() as Record<string, unknown>)
        : undefined
    const previousSnapshot = readPublishedSnapshot(setlist)
    const snapshotDiff = diffSnapshots(previousSnapshot, published.snapshot)

    // ── Audience role breakdown. The dryRun envelope carries `recipients`
    // (with uid + name + email + smsEligible) but NOT the role. Look up
    // the role per uid from users/{uid} so the agent can say "23 band
    // members, 9 musicians, 1 admin" in chat.
    const recipientUids = published.recipients
        .map((r) => r.uid)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
    const breakdown = await loadRoleBreakdown(db, recipientUids)

    // ── Flagged bonds awaiting batch review (Task 4's collection). Doc id
    // shape is `{setlistId}_{trackId}`, so prefix-range over docId pulls
    // the setlist's flags cheaply.
    const flaggedBonds = await countFlaggedBonds(db, args.setlistId)

    // ── Recommendation gate. publish_setlist's chartHealth carries the
    // aggregate counts directly post-F-006, so we just pass them through.
    const recommendation: PreviewPublishResult["recommendation"] =
        published.chartHealth.missingCount > 0
            ? "hard_block"
            : flaggedBonds > 0
              ? "review_first"
              : "publish"

    return {
        ok: true,
        setlistId: args.setlistId,
        setlistName: published.setlistName,
        wasAlreadyPublished: published.wasAlreadyPublished,
        chartHealth: {
            bondedCount: published.chartHealth.bondedCount,
            okCount: published.chartHealth.okCount,
            missingCount: published.chartHealth.missingCount,
            unreachableCount: published.chartHealth.unreachableCount,
            needsSyncCount: published.chartHealth.needsSyncCount,
            unhealthy: published.chartHealth.unhealthy,
        },
        audience: {
            count: published.recipientCount,
            breakdown,
        },
        snapshotDiff,
        flaggedBonds,
        recommendation,
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

type SnapshotRow = { title: string; key: string; fileId: string }

function readPublishedSnapshot(
    setlist: Record<string, unknown> | undefined,
): SnapshotRow[] {
    if (!setlist) return []
    const raw = setlist.publishedSnapshot
    if (!Array.isArray(raw)) return []
    return raw
        .map((r) => {
            if (!r || typeof r !== "object") return null
            const row = r as Record<string, unknown>
            return {
                title: typeof row.title === "string" ? row.title : "",
                key: typeof row.key === "string" ? row.key : "",
                fileId: typeof row.fileId === "string" ? row.fileId : "",
            }
        })
        .filter((r): r is SnapshotRow => r !== null && r.fileId !== "")
}

function diffSnapshots(
    previous: SnapshotRow[],
    current: SnapshotRow[],
): PreviewPublishResult["snapshotDiff"] {
    const prevByFileId = new Map(previous.map((r) => [r.fileId, r]))
    const currByFileId = new Map(current.map((r) => [r.fileId, r]))

    const added: SnapshotRow[] = []
    const modified: PreviewPublishResult["snapshotDiff"]["modifiedTracks"] = []
    for (const row of current) {
        if (!row.fileId) continue
        const prior = prevByFileId.get(row.fileId)
        if (!prior) {
            added.push(row)
            continue
        }
        if (prior.title !== row.title || prior.key !== row.key) {
            modified.push({
                fileId: row.fileId,
                title: row.title,
                key: row.key,
                previousTitle: prior.title !== row.title ? prior.title : undefined,
                previousKey: prior.key !== row.key ? prior.key : undefined,
            })
        }
    }
    const removed: SnapshotRow[] = []
    for (const row of previous) {
        if (!row.fileId) continue
        if (!currByFileId.has(row.fileId)) removed.push(row)
    }
    return { addedTracks: added, removedTracks: removed, modifiedTracks: modified }
}

async function loadRoleBreakdown(
    db: FirebaseFirestore.Firestore,
    uids: string[],
): Promise<PreviewPublishResult["audience"]["breakdown"]> {
    const breakdown = { admin: 0, band_leader: 0, musician: 0, member: 0 }
    if (uids.length === 0) return breakdown
    const docs = await Promise.all(
        uids.map((uid) => db.collection("users").doc(uid).get()),
    )
    for (const doc of docs) {
        if (!doc.exists) continue
        const role = (doc.data() as { role?: string }).role
        if (role === "admin") breakdown.admin++
        else if (role === "band_leader") breakdown.band_leader++
        else if (role === "musician") breakdown.musician++
        else if (role === "member") breakdown.member++
    }
    return breakdown
}

async function countFlaggedBonds(
    db: FirebaseFirestore.Firestore,
    setlistId: string,
): Promise<number> {
    // Doc id shape is `{setlistId}_{trackId}`; an indexed `setlistId` field
    // on each flag doc lets us scope cheaply without a __name__ prefix
    // range. Falls back to 0 if the collection doesn't exist yet (first
    // run before any flag was written).
    try {
        const snap = await db
            .collection("bond_flags")
            .where("setlistId", "==", setlistId)
            .get()
        return snap.size
    } catch {
        return 0
    }
}
