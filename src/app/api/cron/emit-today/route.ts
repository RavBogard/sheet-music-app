import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"
import { emitToday, readStoredToday } from "@/lib/today/emit-today"
import { sendBridgeHealthAlert } from "@/lib/email"
import {
    evaluateTodayFreshness,
    type OrgEmitOutcome,
} from "./evaluate"
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
 * GET /api/cron/emit-today — 15-minute regeneration of the public `today.json`.
 *
 * HOURLY, not daily, since R2-f (2026-09-15); every 15 minutes since the
 * 2026-09-19 audit item (c). It used to be daily because
 * publish regenerated the document and the cron only had to roll the week
 * over. R2-f removed the publish gate on the grounds that CRC never publishes
 * — which also means the publish hook never fires, and this cron became the
 * ONLY path by which a setlist Daniel authored this afternoon reaches the
 * reader. A day of staleness was acceptable when publish was the live path; it
 * is not when this is. One run per org, each writing only its own
 * `public/today/<org>.json`.
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

/** Firestore Timestamp, Date or ISO string → epoch ms, or null. */
function toMillis(value: unknown): number | null {
    if (value == null) return null
    if (value instanceof Date) return value.getTime()
    if (typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis()
    }
    if (typeof value === "string") {
        const ms = Date.parse(value)
        return Number.isFinite(ms) ? ms : null
    }
    return null
}

/**
 * Do not re-send the same outstanding problem more often than this. A problem
 * of a different shape always sends immediately.
 *
 * The cron fires every 15 minutes. Without this guard a bucket permission
 * failure on a Friday afternoon would mail Daniel 96 times before Saturday
 * morning, which is the same as mailing him nothing.
 */
const RENOTIFY_AFTER_MS = 6 * 60 * 60 * 1000

const WATCH_DOC = "emitTodayWatch"

/**
 * Send the alert when `today.json` is not fresh, suppressing a repeat of the
 * same problem. Mirrors `config/bridgeWatch` in the bridge-watch cron: the
 * signature is the shape of the problem, cleared on recovery so the next
 * failure is news again.
 *
 * Alerting must never fail the run — a mail server that is down is not a
 * reason to also stop regenerating the file.
 */
async function alertIfUnhealthy(
    db: FirebaseFirestore.Firestore,
    verdict: ReturnType<typeof evaluateTodayFreshness>,
): Promise<boolean> {
    const ref = db.collection("config").doc(WATCH_DOC)
    const now = Date.now()

    try {
        const snap = await ref.get()
        const prev = snap.exists ? (snap.data() as Record<string, unknown>) : undefined

        // ── Silent when green ──────────────────────────────────────────────
        if (verdict.healthy) {
            if (prev?.signature) {
                await ref.set(
                    {
                        signature: "",
                        lastCheckedAt: new Date(now),
                        recoveredAt: new Date(now),
                    },
                    { merge: true },
                )
            } else {
                await ref.set({ signature: "", lastCheckedAt: new Date(now) }, { merge: true })
            }
            return false
        }

        const prevSignature = typeof prev?.signature === "string" ? prev.signature : ""
        // Firestore hands this back as a Timestamp; a Date or an ISO string is
        // what a test or a hand-written row looks like. Accept all three —
        // failing to read it would mean re-notifying every 15 minutes, which
        // is the failure this guard exists to prevent.
        const prevNotifiedMs = toMillis(prev?.lastNotifiedAt)
        const sameProblem = prevSignature === verdict.signature
        const suppressed =
            sameProblem &&
            prevNotifiedMs != null &&
            Number.isFinite(prevNotifiedMs) &&
            now - prevNotifiedMs < RENOTIFY_AFTER_MS

        if (suppressed) {
            await ref.set(
                { signature: verdict.signature, lastCheckedAt: new Date(now) },
                { merge: true },
            )
            return false
        }

        await sendBridgeHealthAlert({
            subject: "today.json is not being regenerated",
            problems: verdict.problems,
            remedy: verdict.remedy,
            detail: { freshness: verdict.detail },
            checkedAt: new Date(now),
        })

        await ref.set(
            {
                signature: verdict.signature,
                lastCheckedAt: new Date(now),
                lastNotifiedAt: new Date(now),
            },
            { merge: true },
        )
        return true
    } catch (err) {
        // A failed alert must not fail the emit. Log loudly and carry on.
        logger.error("[emit-today cron] alerting failed", err)
        return false
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

        const outcomes: OrgEmitOutcome[] = []
        const serviceCounts: Record<string, number | undefined> = {}

        // Every tenant, each to its own file. Never one file for two orgs.
        //
        // Emit, then READ THE OBJECT BACK. `emitToday` never throws and returns
        // `{ok:false}` on failure, and since Publish was retired this cron is
        // the only writer — so its own return value is not enough to say the
        // reader is looking at fresh bytes. See `evaluate.ts`.
        for (const org of Object.keys(ORGS) as OrgId[]) {
            const res = await emitToday(org)
            if (!res.ok) {
                outcomes.push({ org, ok: false, error: res.error })
                continue
            }
            serviceCounts[org] = res.serviceCount

            const outcome: OrgEmitOutcome = { org, ok: true }
            try {
                const stored = await readStoredToday(org)
                const ms = stored ? Date.parse(stored.generatedAt) : NaN
                outcome.readBackGeneratedAtMs =
                    stored && Number.isFinite(ms) ? ms : null
                if (stored && !Number.isFinite(ms)) {
                    outcome.readBackError = `generatedAt is not a parseable instant: ${String(
                        stored.generatedAt,
                    )}`
                    delete outcome.readBackGeneratedAtMs
                }
            } catch (err) {
                outcome.readBackError =
                    err instanceof Error ? err.message : String(err)
            }
            outcomes.push(outcome)
        }

        const verdict = evaluateTodayFreshness({ outcomes, now: Date.now() })
        const notified = await alertIfUnhealthy(db, verdict)

        if (!verdict.healthy) {
            logger.warn("[emit-today cron] today.json is not fresh", {
                problems: verdict.problems,
                notified,
            })
        }

        return NextResponse.json({
            ok: true,
            healthy: verdict.healthy,
            notified,
            results: outcomes.map((o) => ({
                org: o.org,
                ok: o.ok,
                ...(o.error ? { error: o.error } : {}),
                ...(serviceCounts[o.org] !== undefined
                    ? { serviceCount: serviceCounts[o.org] }
                    : {}),
            })),
            freshness: verdict.detail,
        })
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
