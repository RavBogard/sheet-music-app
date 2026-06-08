import "server-only"

import { FieldValue } from "firebase-admin/firestore"

import { DEFAULT_ORG_ID, ORGS } from "@/lib/org/registry"

/**
 * v11-01-03 — one-time tenant backfill + org seeding.
 *
 * Stamps `orgId` on every EXISTING doc that lacks it across the five
 * tenant-scoped collections, and seeds the `orgs/{orgId}` registry collection.
 * Paired with v11-01-02 (which stamps orgId on NEW writes), this is the second
 * precondition for strict org-scoped rules in v11-01-04 — without it, a rule
 * that `require`s orgId would reject every legacy CRC doc → service lock-out.
 *
 * All existing data is CRC, so the backfill is a uniform `orgId="crc"` stamp.
 * brotherslazaroff has no data yet; its org doc is seeded for v11-03 host
 * routing.
 *
 * Design (mirrors backfill_track_mimetype + scripts/backfill-drive-id-*.mjs):
 *  - dryRun defaults TRUE (F-05 dryRun-is-observability). No writes on a dry run.
 *  - Idempotent: a doc that already carries a non-empty `orgId` is SKIPPED,
 *    never overwritten. A second apply run stamps 0.
 *  - Firestore can't query "field absent", so the candidate filter runs in
 *    memory after a full collection scan.
 *  - Writes use batched `set({ orgId }, { merge: true })` so ONLY orgId is
 *    touched — no sibling-field clobber, no version/timestamp churn on
 *    untouched fields.
 *
 * The logic lives here (db-injected) so it is emulator-testable; the prod
 * runner `scripts/backfill-orgid-v11.mjs` is a thin wrapper over the same rules.
 */

type DB = FirebaseFirestore.Firestore

/** The five collections that carry tenant-scoped docs. */
export const TENANT_COLLECTIONS = [
    "setlists",
    "tracks",
    "library_index",
    "songs",
    "recordings",
] as const

export type TenantCollection = (typeof TENANT_COLLECTIONS)[number]

/** Firestore rejects batches over 500 writes; stay under it (matches backfill_track_mimetype). */
const WRITE_BATCH_MAX = 400

export interface CollectionBackfillReport {
    /** Total docs in the collection. */
    scanned: number
    /** Docs that already carry a non-empty orgId — skipped. */
    alreadyStamped: number
    /** Docs missing orgId that WOULD be stamped (populated on dryRun). */
    wouldStamp: number
    /** Docs missing orgId that WERE stamped (populated on apply). */
    stamped: number
}

export interface BackfillOrgIdResult {
    dryRun: boolean
    orgId: string
    perCollection: Record<TenantCollection, CollectionBackfillReport>
}

/** True when a doc has no usable orgId (absent or empty/whitespace string). */
function needsStamp(data: FirebaseFirestore.DocumentData): boolean {
    const v = data.orgId
    return !(typeof v === "string" && v.trim().length > 0)
}

/**
 * Stamp `orgId = DEFAULT_ORG_ID` on every doc missing it across the five
 * tenant collections. Idempotent; dry-run by default.
 */
export async function backfillOrgId(
    db: DB,
    opts: { dryRun?: boolean } = {},
): Promise<BackfillOrgIdResult> {
    const dryRun = opts.dryRun !== false
    const orgId = DEFAULT_ORG_ID

    const perCollection = {} as Record<TenantCollection, CollectionBackfillReport>

    for (const col of TENANT_COLLECTIONS) {
        const snap = await db.collection(col).get()
        const report: CollectionBackfillReport = {
            scanned: snap.size,
            alreadyStamped: 0,
            wouldStamp: 0,
            stamped: 0,
        }

        const candidates: string[] = []
        for (const doc of snap.docs) {
            if (needsStamp(doc.data())) {
                candidates.push(doc.id)
            } else {
                report.alreadyStamped++
            }
        }

        if (dryRun) {
            report.wouldStamp = candidates.length
            perCollection[col] = report
            continue
        }

        // Apply: batched merge-set of ONLY orgId.
        for (let i = 0; i < candidates.length; i += WRITE_BATCH_MAX) {
            const slice = candidates.slice(i, i + WRITE_BATCH_MAX)
            const batch = db.batch()
            for (const id of slice) {
                batch.set(
                    db.collection(col).doc(id),
                    { orgId },
                    { merge: true },
                )
            }
            await batch.commit()
            report.stamped += slice.length
        }
        perCollection[col] = report
    }

    return { dryRun, orgId, perCollection }
}

export interface OrgSeedReport {
    id: string
    action: "create" | "update" | "noop"
}

export interface SeedOrgsResult {
    dryRun: boolean
    orgs: OrgSeedReport[]
}

/**
 * Seed `orgs/{orgId}` from the static ORGS registry. Merge-set of id/name/domain;
 * `createdAt` is stamped ONLY when the existing doc has none, so re-runs preserve
 * the original creation time. Idempotent; dry-run by default.
 */
export async function seedOrgs(
    db: DB,
    opts: { dryRun?: boolean } = {},
): Promise<SeedOrgsResult> {
    const dryRun = opts.dryRun !== false
    const orgs: OrgSeedReport[] = []

    for (const org of Object.values(ORGS)) {
        const ref = db.collection("orgs").doc(org.id)
        const existing = await ref.get()
        const hasCreatedAt =
            existing.exists && existing.data()?.createdAt !== undefined

        let action: OrgSeedReport["action"]
        if (!existing.exists) action = "create"
        else if (!hasCreatedAt) action = "update"
        else action = "noop"

        if (!dryRun) {
            const payload: Record<string, unknown> = {
                id: org.id,
                name: org.name,
                domain: org.domain,
            }
            // Stamp createdAt only when absent — never reset it on re-run.
            if (!hasCreatedAt) {
                payload.createdAt = FieldValue.serverTimestamp()
            }
            await ref.set(payload, { merge: true })
        }

        orgs.push({ id: org.id, action })
    }

    return { dryRun, orgs }
}
