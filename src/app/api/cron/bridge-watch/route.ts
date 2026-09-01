import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { sendBridgeHealthAlert } from "@/lib/email"
import { sendPushToUsers } from "@/lib/push-send"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { evaluateBridge, toMillis, type BridgeHeartbeat, type BridgeVerdict } from "./evaluate"

/**
 * GET /api/cron/bridge-watch — the pre-service bridge tripwire (R8).
 *
 * ## Why this exists
 *
 * Musicians run their own monitor mixes from iPads during the service, and the
 * owner CANNOT intervene once it has started. So the only useful time to learn
 * that the bridge is dead is BEFORE — Thursday night, or Friday afternoon, while
 * there is still time to walk over and restart a PC. Until now detection was
 * entirely pull-based: `get_bridge_health` if someone thought to ask, a tray
 * icon on a machine nobody watches, or the band discovering it at soundcheck.
 *
 * `bridge.status` only becomes "offline" on a GRACEFUL shutdown, so a crashed
 * bridge reads "online" indefinitely (13.5h stale + still "online" is recorded
 * in the observability audit). The only trustworthy liveness signal is
 * `now − lastSeen`, which is what this route computes — deliberately the same
 * math and the same 120s threshold as `src/lib/mcp/tools/bridge-health.ts`, so
 * a cron alert and a `get_bridge_health` probe can never disagree.
 *
 * ## Relationship to admin-consistency
 *
 * `/api/cron/admin-consistency` ALREADY watches bridge silence, errCount spikes
 * and sustained X32 disconnects — but every one of those alarms is a Sentry
 * `captureMessage`, which reaches a human only if that human is reading Sentry.
 * This route is the other half: a push + email that arrives on the owner's phone,
 * timed to the service, naming the remedy. It does not replace those alarms and
 * deliberately does not duplicate their delta bookkeeping (`config/bridgeHealth`
 * belongs to that lane; this one owns `config/bridgeWatch`).
 *
 * ## Silent when green
 *
 * Nothing is sent when the bridge is healthy, and a problem that is already
 * outstanding is not re-sent until it clears or changes shape (see
 * `config/bridgeWatch`). An alert that fires every Friday regardless is an alert
 * that gets muted by the third week — and then the one that matters is muted too.
 *
 * ## Schedule (vercel.json — three entries, all pointing here)
 *
 *   `0 14 * * *`   daily light check       09:00 America/Chicago
 *   `0 19 * * 5`   Friday, early           14:00 America/Chicago
 *   `30 21 * * 5`  Friday, last chance     16:30 America/Chicago — before soundcheck
 *
 * Vercel crons are UTC-only and do NOT follow DST, so those local times are
 * given for CDT (UTC−5) and land an hour EARLIER in local terms during CST.
 * That is harmless for the daily check and still comfortably pre-service for the
 * Friday pair; if Friday services ever move earlier, re-derive these two.
 * vercel.json is strict JSON with no comment support, which is why this table
 * lives here — keep it in step with the file.
 *
 * Protected by CRON_SECRET bearer token, like every other cron route here.
 */

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Do not re-send the same outstanding problem more often than this. A genuinely
 * new problem (different shape) always sends immediately.
 */
const RENOTIFY_AFTER_MS = 6 * 60 * 60 * 1000

export async function GET(req: Request) {
    const authHeader = req.headers.get("authorization")
    const cronSecret = env.CRON_SECRET
    if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        if (!initAdmin()) {
            return NextResponse.json({ error: "Server not ready" }, { status: 500 })
        }
        const db = getFirestore()
        const now = Date.now()

        const [monitorDoc, stateDoc, watchDoc] = await Promise.all([
            db.collection("config").doc("monitor").get(),
            db.collection("monitor-live").doc("state").get(),
            db.collection("config").doc("bridgeWatch").get(),
        ])

        const monitor = monitorDoc.exists ? (monitorDoc.data() as Record<string, unknown>) : undefined
        const bridge = (monitor?.bridge as BridgeHeartbeat | undefined) ?? undefined
        const lease = monitor?.bridgeLease as { expiresAt?: number } | undefined

        const verdict = evaluateBridge({
            bridge,
            stateUpdatedAt: stateDoc.exists ? stateDoc.data()?.updatedAt : null,
            leaseExpiresAt: typeof lease?.expiresAt === "number" ? lease.expiresAt : null,
            now,
        })

        // ── Silent when green ──────────────────────────────────────────────
        if (verdict.healthy) {
            // Clear the outstanding-problem marker so the NEXT failure notifies
            // immediately rather than being suppressed by the re-notify guard.
            if (watchDoc.exists && watchDoc.data()?.signature) {
                await db.collection("config").doc("bridgeWatch").set(
                    { signature: "", lastCheckedAt: new Date(now), recoveredAt: new Date(now) },
                    { merge: true },
                )
            } else {
                await db.collection("config").doc("bridgeWatch").set(
                    { signature: "", lastCheckedAt: new Date(now) },
                    { merge: true },
                )
            }
            logger.info("[Cron/BridgeWatch] Bridge healthy — no alert sent")
            return NextResponse.json({ success: true, healthy: true, notified: false })
        }

        // ── Something is wrong ─────────────────────────────────────────────
        const prev = watchDoc.exists ? (watchDoc.data() as Record<string, unknown>) : undefined
        const prevSignature = typeof prev?.signature === "string" ? prev.signature : ""
        const prevNotifiedMs = toMillis(prev?.lastNotifiedAt)
        const sameProblem = prevSignature === verdict.signature
        const suppressed =
            sameProblem && prevNotifiedMs != null && now - prevNotifiedMs < RENOTIFY_AFTER_MS

        if (suppressed) {
            logger.info(
                "[Cron/BridgeWatch] Problem unchanged (%s) and already notified — staying quiet",
                verdict.signature,
            )
            await db
                .collection("config")
                .doc("bridgeWatch")
                .set({ signature: verdict.signature, lastCheckedAt: new Date(now) }, { merge: true })
            return NextResponse.json({
                success: true,
                healthy: false,
                notified: false,
                suppressed: true,
                signature: verdict.signature,
            })
        }

        const headline = verdict.problems[0]
        const body = `${headline} ${verdict.remedy}`.slice(0, 480)

        // Recipients: admins. Band leaders are deliberately NOT paged — only the
        // person who can physically reach the venue PC can act on this.
        let adminUids: string[] = []
        try {
            const admins = await db.collection("users").where("role", "==", "admin").get()
            adminUids = admins.docs.map(d => d.id)
        } catch (e) {
            logger.warn("[Cron/BridgeWatch] Admin lookup failed:", e)
        }

        let pushed = 0
        if (adminUids.length > 0) {
            try {
                const result = await sendPushToUsers(adminUids, {
                    title: "Monitor bridge needs attention",
                    body,
                    link: "/admin",
                })
                pushed = result.sent
            } catch (e) {
                logger.warn("[Cron/BridgeWatch] Push failed:", e)
            }

            // In-app notification too — push permission is easy to lose on iOS,
            // and this one must not depend on a single delivery channel.
            for (const uid of adminUids) {
                try {
                    await db.collection("users").doc(uid).collection("notifications").add({
                        type: "bridge_health",
                        title: "Monitor bridge needs attention",
                        body,
                        link: "/admin",
                        read: false,
                        createdAt: new Date(now),
                    })
                } catch (e) {
                    logger.warn(`[Cron/BridgeWatch] Notification write failed for ${uid}:`, e)
                }
            }
        }

        const email = await sendBridgeHealthAlert({
            subject: verdict.alive
                ? "Monitor bridge degraded — check before the service"
                : "Monitor bridge is DOWN — check before the service",
            problems: verdict.problems,
            remedy: verdict.remedy,
            detail: {
                lastSeenAgeS: verdict.lastSeenAgeS,
                stateAgeS: verdict.stateAgeS,
                mixerReachable: verdict.mixerReachable,
                leaseExpired: verdict.leaseExpired,
                bridgeVersion: bridge?.version ?? null,
                errCount: bridge?.errCount ?? null,
                lastError: bridge?.lastError ?? null,
            },
            checkedAt: new Date(now),
        })

        await db.collection("config").doc("bridgeWatch").set(
            {
                signature: verdict.signature,
                lastCheckedAt: new Date(now),
                lastNotifiedAt: new Date(now),
                lastProblems: verdict.problems,
            },
            { merge: true },
        )

        logger.warn(
            "[Cron/BridgeWatch] ALERT (%s): %s — push:%d email:%s",
            verdict.signature,
            headline,
            pushed,
            email.ok ? "sent" : (email.reason ?? "failed"),
        )

        return NextResponse.json({
            success: true,
            healthy: false,
            notified: true,
            signature: verdict.signature,
            problems: verdict.problems,
            remedy: verdict.remedy,
            pushed,
            emailed: email.ok,
        })
    } catch (error) {
        logger.error("[Cron/BridgeWatch] Failed:", error)
        captureException(error, { source: "cron", location: "bridge-watch" })
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
