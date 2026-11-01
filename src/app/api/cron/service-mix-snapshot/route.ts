import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { toMillis } from "@/app/api/cron/bridge-watch/evaluate"
import { bridgeConfigOrg, mixerOn, MIXER_ORG_ID } from "@/lib/org/mixer"
import { loadServiceSchedule } from "@/lib/monitor/load-service-schedule"
import {
    AUTO_KEEP,
    buildServiceSnapshot,
    mirrorCoversService,
    ownedBuses,
    servicesDueForSnapshot,
    snapshotIdFor,
} from "@/lib/monitor/service-snapshot"
import { SNAPSHOTS_ROOT } from "@/lib/monitor/saved-mixes"

/**
 * GET /api/cron/service-mix-snapshot — the end-of-service mix snapshot, taken on
 * the server.
 *
 * ## Why this exists
 *
 * The studio PC (and so the X32 bridge) is switched on before each service and
 * off after it. The bridge's own end-of-service snapshot (2 h after the start,
 * `bridge/src/auto-snapshots.ts`) therefore often never runs, and musicians have
 * nothing under "After recent services" in /monitor. The bridge mirrors the full
 * mix to `monitor-live/state` (every bus master, every send level and mute, the
 * channel names), and that document keeps the last mix the bridge saw after the
 * PC is off, which is the end-of-service mix. So the snapshot is built from the
 * mirror here, and no bridge release is needed.
 *
 * Same snapshot, same path, same id as the bridge's (`auto-<date>-<setlistId>`),
 * written with `create()`: whoever writes first wins and the other finds it
 * already there, so a service never gets two. Only the newest 10 auto snapshots
 * per bus are kept, as the bridge does; named snapshots are never touched.
 *
 * Guard: the mirror must have been written no earlier than 30 minutes before the
 * service started. A mirror older than that is a previous day's mix from a PC
 * that never came on for this service, and is not saved as this service's.
 *
 * ## Schedule (vercel.json)
 *
 *   `10 * * * *`   hourly, at :10
 *
 * A service becomes eligible 2 h after its start and stays eligible for 6 h, so an
 * hourly run always catches it; services can fall on any day, so no day or hour is
 * baked in. The route returns at once when no service is eligible.
 *
 * CRC only: the monitor is CRC's and behind its `mixer` flag; any other tenant has
 * none of this. Protected by CRON_SECRET bearer token, like every other cron here.
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

        if (!(await mixerOn(MIXER_ORG_ID))) {
            return NextResponse.json({ success: true, skipped: "feature_off" })
        }

        const due = servicesDueForSnapshot(await loadServiceSchedule(now), now)
        if (due.length === 0) {
            return NextResponse.json({ success: true, skipped: "no_service_due" })
        }

        const [monitorDoc, stateDoc] = await Promise.all([
            db.collection("config").doc("monitor").get(),
            db.collection("monitor-live").doc("state").get(),
        ])
        const monitor = monitorDoc.exists ? (monitorDoc.data() as Record<string, unknown>) : undefined
        if (monitor && bridgeConfigOrg(monitor) !== MIXER_ORG_ID) {
            logger.warn("[Cron/ServiceMixSnapshot] config/monitor names another tenant — skipping")
            return NextResponse.json({ success: true, skipped: "bridge_tenant_mismatch" })
        }
        if (!stateDoc.exists) {
            return NextResponse.json({ success: true, skipped: "no_mirror" })
        }
        const state = stateDoc.data() as Record<string, unknown>
        const mirrorMs = toMillis(state.updatedAt)
        const buses = ownedBuses(monitor?.busAssignments)
        if (buses.length === 0) {
            return NextResponse.json({ success: true, skipped: "no_owned_buses" })
        }

        const created: string[] = []
        const existing: string[] = []
        const skipped: Array<{ service: string; reason: string }> = []

        for (const service of due) {
            if (mirrorMs == null || !mirrorCoversService(mirrorMs, service.startMs)) {
                skipped.push({ service: service.key, reason: "bridge_not_up_for_service" })
                continue
            }
            const id = snapshotIdFor(service)
            for (const bus of buses) {
                const doc = buildServiceSnapshot(bus, state, mirrorMs, service.serviceType)
                if (!doc) continue
                const col = db.collection([...SNAPSHOTS_ROOT, String(bus), "items"].join("/"))
                try {
                    await col.doc(id).create(doc)
                    created.push(`${id}:${bus}`)
                } catch (err) {
                    const code = (err as { code?: unknown })?.code
                    if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") {
                        existing.push(`${id}:${bus}`)
                        continue
                    }
                    throw err
                }
                await pruneAuto(db, col)
            }
        }

        logger.info(
            "[Cron/ServiceMixSnapshot] created=%d existing=%d skipped=%d",
            created.length,
            existing.length,
            skipped.length,
        )
        return NextResponse.json({ success: true, created, existing, skipped })
    } catch (error) {
        logger.error("[Cron/ServiceMixSnapshot] Failed:", error)
        captureException(error, { source: "cron", location: "service-mix-snapshot" })
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

/** Keep the newest AUTO_KEEP auto snapshots on a bus. Named ones are never touched. */
async function pruneAuto(db: FirebaseFirestore.Firestore, col: FirebaseFirestore.CollectionReference) {
    try {
        const snap = await col.where("kind", "==", "auto").get()
        const rows = snap.docs
            .map((d) => ({ ref: d.ref, ms: toMillis(d.data()?.createdAt) ?? 0 }))
            .sort((a, b) => b.ms - a.ms)
        const extra = rows.slice(AUTO_KEEP)
        if (extra.length === 0) return
        const batch = db.batch()
        for (const r of extra) batch.delete(r.ref)
        await batch.commit()
    } catch (err) {
        logger.warn("[Cron/ServiceMixSnapshot] prune failed (non-blocking):", err)
    }
}
