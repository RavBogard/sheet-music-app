import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { emitToday } from "@/lib/today/emit-today"
import { ORGS } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/emit-today — daily regeneration of the public `today.json`.
 *
 * Publish already regenerates the document, so this cron exists for the
 * services nobody publishes today: a week rolls off, a service that was
 * deleted or unpublished disappears, and `generatedAt` stays honest. One run
 * per org, each writing only its own `public/today/<org>.json`.
 *
 * DOUBLE-START. Vercel can invoke a cron more than once for the same slot.
 * The repo has no shared lock to mirror — every other cron here relies on its
 * work being idempotent — so this route carries a small one of its own. It is
 * a COST guard, not a correctness guard: two concurrent runs would write the
 * same bytes to the same object, so the failure mode is duplicated reads, not
 * a corrupted file. The lock is therefore deliberately soft — a stale lock
 * expires, and a lock read that fails lets the run proceed rather than
 * skipping a day's regeneration.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`, as every cron here.
 */

const LOCK_COLLECTION = "cronLocks"
const LOCK_DOC = "emit-today"
/** A run takes seconds; anything older than this is a crashed run, not a peer. */
const LOCK_TTL_MS = 5 * 60 * 1000

async function claimLock(db: FirebaseFirestore.Firestore): Promise<boolean> {
    const ref = db.collection(LOCK_COLLECTION).doc(LOCK_DOC)
    try {
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref)
            const startedAt = snap.exists
                ? (snap.data()?.startedAt as { toMillis?: () => number } | undefined)
                : undefined
            const startedMs =
                startedAt && typeof startedAt.toMillis === "function"
                    ? startedAt.toMillis()
                    : 0
            if (startedMs && Date.now() - startedMs < LOCK_TTL_MS) return false
            tx.set(ref, { startedAt: FieldValue.serverTimestamp() }, { merge: true })
            return true
        })
    } catch (err) {
        // Fail OPEN. A lock we cannot read must not cost the congregation a
        // day of regeneration; the worst case is a duplicate write of
        // identical bytes.
        logger.warn("[emit-today cron] lock read failed — proceeding", {
            err: err instanceof Error ? err.message : String(err),
        })
        return true
    }
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization")
    const cronSecret = env.CRON_SECRET
    if (
        !cronSecret ||
        !authHeader ||
        !safeCompare(authHeader, `Bearer ${cronSecret}`)
    ) {
        return httpError(
            401,
            "unauthenticated",
            "Cron route requires Vercel CRON_SECRET bearer auth.",
            {},
            "This endpoint is invoked by Vercel cron; manual probes will always 401.",
        )
    }

    try {
        initAdmin()
        const db = getFirestore()

        if (!(await claimLock(db))) {
            logger.info("[emit-today cron] a run is already in flight — skipping")
            return NextResponse.json({ ok: true, skipped: "already_running" })
        }

        const results: Array<{
            org: OrgId
            ok: boolean
            serviceCount?: number
            error?: string
        }> = []

        // Every tenant, each to its own file. Never one file for two orgs.
        for (const org of Object.keys(ORGS) as OrgId[]) {
            const res = await emitToday(org)
            results.push(
                res.ok
                    ? { org, ok: true, serviceCount: res.serviceCount }
                    : { org, ok: false, error: res.error },
            )
        }

        const failed = results.filter((r) => !r.ok)
        if (failed.length) {
            logger.warn("[emit-today cron] some orgs failed", { failed })
        }
        return NextResponse.json({ ok: true, results })
    } catch (err) {
        logger.error("[emit-today cron] failed", err)
        return httpError(
            500,
            "emit_today_failed",
            err instanceof Error ? err.message : String(err),
            {},
            "Check Firestore and Storage connectivity; today.json is non-critical and the previous file is still served.",
        )
    }
}
