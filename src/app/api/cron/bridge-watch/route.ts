import { listTenantMembers } from "@/lib/org/access"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { sendBridgeHealthAlert } from "@/lib/email"
import { sendPushToUsers } from "@/lib/push-send"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { evaluateBridge, type BridgeHeartbeat } from "./evaluate"
import { bridgeAlertRecipients } from "./recipients"
import { alertDecision, servicesInAlertWindow } from "./service-window"
import { loadServiceSchedule } from "@/lib/monitor/load-service-schedule"
import { formatLocalTime } from "@/lib/monitor/service-start"
import { bridgeConfigOrg, mixerOn, MIXER_ORG_ID } from "@/lib/org/mixer"

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
 * ## Timed to the service, silent otherwise
 *
 * The studio PC is switched on by Michael before each service and off after
 * (Daniel, 2026-11-01), so "bridge down" is the NORMAL state for most of the week.
 * This route therefore only looks at the bridge in a window before a CRC service:
 * 20 to 40 minutes before its start (Michael arrives ~45 min ahead, the band at
 * 30). Down at any other time never alerts. The start time comes from the same
 * `today.json` services the band's surfaces read (setlist `startsAtLocal` or the
 * congregation config's `defaultStartLocal`), falling back to Friday 18:15 /
 * Saturday 10:00 America/Chicago for a service with no time. A day with no CRC
 * setlist has no service and no check.
 *
 * Nothing is sent when the bridge is healthy, and each service gets its own check
 * and its own dedupe: `config/bridgeWatch` remembers the service (`serviceKey`)
 * and the problem shape (`signature`) last notified, so the later runs inside one
 * window stay quiet, a new problem speaks, and the next service starts fresh.
 *
 * ## Schedule (vercel.json — ONE entry)
 *
 *   minute field "every 15", all other fields "*"   every 15 minutes, every day
 *   (written with a slash in vercel.json; spelled out here because a slash after a star ends a block comment)
 *
 * Vercel crons are UTC-only and do not follow DST, and services can fall on any
 * day (holidays, B'nai Mitzvah), so no clock time is baked into the schedule: the
 * route compares "now" with each service's DST-correct start instant and returns
 * at once when no service is in its window. The 20-minute window on a 15-minute
 * cron guarantees every service at least one check even if a run is late.
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

        // Multi-tenant phase 6: the mixer is CRC-only behind its flag. With
        // crc's `mixer` off there is no bridge to watch.
        if (!(await mixerOn(MIXER_ORG_ID))) {
            logger.info("[Cron/BridgeWatch] mixer is switched off — skipping")
            return NextResponse.json({ success: true, skipped: "feature_off" })
        }

        // Only look at the bridge shortly before a service. The studio PC is off
        // the rest of the week, and that must never alert.
        const due = servicesInAlertWindow(await loadServiceSchedule(now), now)[0]
        if (!due) {
            logger.info("[Cron/BridgeWatch] no service in the pre-service window — nothing to check")
            return NextResponse.json({ success: true, skipped: "no_service_in_window" })
        }
        const startText = formatLocalTime(due.startMs)
        const serviceName = due.name?.trim() || ""
        const serviceLabel = serviceName || "The service"

        const [monitorDoc, stateDoc, watchDoc] = await Promise.all([
            db.collection("config").doc("monitor").get(),
            db.collection("monitor-live").doc("state").get(),
            db.collection("config").doc("bridgeWatch").get(),
        ])

        const monitorData = monitorDoc.exists ? (monitorDoc.data() as Record<string, unknown>) : undefined
        // The bridge config must be the mixer tenant's (absent orgId = crc).
        if (monitorData && bridgeConfigOrg(monitorData) !== MIXER_ORG_ID) {
            logger.warn("[Cron/BridgeWatch] config/monitor names another tenant — skipping", {
                orgId: bridgeConfigOrg(monitorData),
            })
            return NextResponse.json({ success: true, skipped: "bridge_tenant_mismatch" })
        }
        const monitor = monitorData
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
            const wasOutstanding = watchDoc.exists && !!watchDoc.data()?.signature
            await db.collection("config").doc("bridgeWatch").set(
                {
                    signature: "",
                    serviceKey: due.key,
                    lastCheckedAt: new Date(now),
                    ...(wasOutstanding ? { recoveredAt: new Date(now) } : {}),
                },
                { merge: true },
            )
            logger.info("[Cron/BridgeWatch] Bridge healthy for %s — no alert sent", due.key)
            return NextResponse.json({ success: true, healthy: true, notified: false, service: due.key })
        }

        // ── Something is wrong ─────────────────────────────────────────────
        const prev = watchDoc.exists ? (watchDoc.data() as Record<string, unknown>) : undefined

        if (alertDecision(prev, due.key, verdict.signature) === "suppress") {
            logger.info(
                "[Cron/BridgeWatch] Problem unchanged (%s) for %s and already notified — staying quiet",
                verdict.signature,
                due.key,
            )
            await db
                .collection("config")
                .doc("bridgeWatch")
                .set({ signature: verdict.signature, serviceKey: due.key, lastCheckedAt: new Date(now) }, { merge: true })
            return NextResponse.json({
                success: true,
                healthy: false,
                notified: false,
                suppressed: true,
                signature: verdict.signature,
                service: due.key,
            })
        }

        const headline = verdict.problems[0]
        const lead = `${serviceLabel} starts at ${startText}.`
        const body = `${lead} ${headline} ${verdict.remedy}`.slice(0, 480)

        // Recipients: admins, sound-engineer flag holders, and the extra uids in
        // config/monitor.bridgeAlertRecipients (Michael). Band leaders are
        // deliberately NOT paged — only people who can act on the bridge are.
        let adminUids: string[] = []
        try {
            // Multi-tenant P2: the admins of the BRIDGE tenant (crc), from
            // memberships (legacy users-doc role for anyone not yet migrated).
            const members = await listTenantMembers("crc", { db })
            adminUids = bridgeAlertRecipients(members, monitor)
        } catch (e) {
            logger.warn("[Cron/BridgeWatch] Admin lookup failed:", e)
            adminUids = bridgeAlertRecipients([], monitor)
        }

        let pushed = 0
        if (adminUids.length > 0) {
            try {
                const result = await sendPushToUsers(adminUids, {
                    title: "Monitor bridge needs attention",
                    body,
                    link: "/manage",
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
                        link: "/manage",
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
                ? `Monitor bridge degraded — check before ${serviceName || "the service"} (${startText})`
                : `Monitor bridge is DOWN — check before ${serviceName || "the service"} (${startText})`,
            problems: [lead, ...verdict.problems],
            remedy: verdict.remedy,
            detail: {
                lastSeenAgeS: verdict.lastSeenAgeS,
                stateAgeS: verdict.stateAgeS,
                mixerReachable: verdict.mixerReachable,
                leaseExpired: verdict.leaseExpired,
                service: due.key,
                bridgeStatusField: bridge?.status ?? null,
                bridgeVersion: bridge?.version ?? null,
                errCount: bridge?.errCount ?? null,
                lastError: bridge?.lastError ?? null,
            },
            checkedAt: new Date(now),
        })

        await db.collection("config").doc("bridgeWatch").set(
            {
                signature: verdict.signature,
                serviceKey: due.key,
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
            service: due.key,
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
