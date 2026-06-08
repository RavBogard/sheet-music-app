import "server-only"

import { DEFAULT_ORG_ID } from "@/lib/org/registry"

/**
 * v11-02-01 — one-time MCP-token tenant backfill.
 *
 * Stamps `orgId="crc"` on every EXISTING `mcpTokens` doc that lacks it, so the
 * caller-org resolution path (verifyBearer → orgFrom) is explicit rather than
 * only default-derived. Paired with v11-02-01's mint-site stamping (which adds
 * orgId to NEW tokens), this leaves zero unstamped bearers in prod.
 *
 * Mirrors the v11-01-03 backfill shape (src/lib/org/backfill-orgid.ts):
 *  - dryRun defaults TRUE (F-05 dryRun-is-observability). No writes on a dry run.
 *  - Idempotent: a doc that already carries a non-empty `orgId` is SKIPPED,
 *    never overwritten. A second apply run stamps 0.
 *  - Firestore can't query "field absent", so the candidate filter runs in
 *    memory after a full collection scan (mcpTokens is tiny — a few dozen docs).
 *  - Writes use batched `set({ orgId }, { merge: true })` so ONLY orgId is
 *    touched — no tokenHash / lastUsedAt / revokedAt clobber.
 *
 * The logic lives here (db-injected) so it is emulator-testable; the prod runner
 * `scripts/backfill-token-orgid.mjs` mirrors the same rules for prod.
 */

type DB = FirebaseFirestore.Firestore

const COLLECTION = "mcpTokens"
/** Firestore rejects batches over 500 writes; stay under it (matches backfill-orgid). */
const WRITE_BATCH_MAX = 400

export interface BackfillTokenOrgIdResult {
    dryRun: boolean
    orgId: string
    /** Total mcpTokens docs. */
    scanned: number
    /** Docs already carrying a non-empty orgId — skipped. */
    alreadyStamped: number
    /** Docs missing orgId that WOULD be stamped (populated on dryRun). */
    wouldStamp: number
    /** Docs missing orgId that WERE stamped (populated on apply). */
    stamped: number
}

/** True when a doc has no usable orgId (absent or empty/whitespace string). */
function needsStamp(data: FirebaseFirestore.DocumentData): boolean {
    const v = data.orgId
    return !(typeof v === "string" && v.trim().length > 0)
}

/**
 * Stamp `orgId = DEFAULT_ORG_ID` on every mcpTokens doc missing it. Idempotent;
 * dry-run by default.
 */
export async function backfillTokenOrgId(
    db: DB,
    opts: { dryRun?: boolean } = {},
): Promise<BackfillTokenOrgIdResult> {
    const dryRun = opts.dryRun !== false
    const orgId = DEFAULT_ORG_ID

    const snap = await db.collection(COLLECTION).get()
    const result: BackfillTokenOrgIdResult = {
        dryRun,
        orgId,
        scanned: snap.size,
        alreadyStamped: 0,
        wouldStamp: 0,
        stamped: 0,
    }

    const candidates: string[] = []
    for (const doc of snap.docs) {
        if (needsStamp(doc.data())) candidates.push(doc.id)
        else result.alreadyStamped++
    }

    if (dryRun) {
        result.wouldStamp = candidates.length
        return result
    }

    for (let i = 0; i < candidates.length; i += WRITE_BATCH_MAX) {
        const slice = candidates.slice(i, i + WRITE_BATCH_MAX)
        const batch = db.batch()
        for (const id of slice) {
            batch.set(db.collection(COLLECTION).doc(id), { orgId }, { merge: true })
        }
        await batch.commit()
        result.stamped += slice.length
    }

    return result
}
