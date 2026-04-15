import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { env } from "@/env.mjs"

/**
 * v4.3 C02 — Admin-role consistency check.
 *
 * firestore.rules grants admin access via EITHER a custom claim
 * (`token.role == 'admin'`) OR membership in `config/admins.uids`.
 * The two paths can drift: if setCustomUserClaims fails silently
 * during an admin promotion, the user keeps `config/admins` access
 * but not the claim — and vice versa. Both paths work in isolation,
 * so the drift can go unnoticed until a role check in the claim-only
 * path breaks.
 *
 * This cron runs daily and logs a warning if any uid in
 * config/admins.uids doesn't have the 'admin' custom claim. Read-
 * only; does NOT auto-repair (a drift is a signal something in the
 * promotion flow failed and should be investigated, not silently
 * papered over).
 */

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const auth = getAuth()

        const adminsDoc = await db.collection("config").doc("admins").get()
        const uids = (adminsDoc.data()?.uids ?? []) as string[]
        if (!Array.isArray(uids) || uids.length === 0) {
            return NextResponse.json({ checked: 0, drift: [] })
        }

        const drift: Array<{ uid: string; reason: string }> = []
        for (const uid of uids) {
            try {
                const user = await auth.getUser(uid)
                const claimRole = (user.customClaims as { role?: string } | undefined)?.role
                if (claimRole !== "admin") {
                    drift.push({ uid, reason: `claim.role=${claimRole ?? "missing"}` })
                }
            } catch (e) {
                drift.push({
                    uid,
                    reason: `getUser failed: ${e instanceof Error ? e.message : String(e)}`,
                })
            }
        }

        if (drift.length > 0) {
            logger.warn(
                `[admin-consistency] drift detected across ${drift.length}/${uids.length} bootstrap-admin uids: ${JSON.stringify(drift)}`,
            )
        } else {
            logger.info(`[admin-consistency] clean (${uids.length} uids)`)
        }

        return NextResponse.json({ checked: uids.length, drift })
    } catch (err) {
        logger.error("[admin-consistency] check failed:", err)
        return NextResponse.json({ error: "Check failed" }, { status: 500 })
    }
}
